import { createHash, createHmac } from "node:crypto";

import {
  CandidateDiscoveryService,
  CandidatePairService,
  SimilarityProfileService,
} from "@knownpath/canonicalization";
import type { KnownPathDatabase } from "@knownpath/database";
import { recordContribution, recordContributionQuality } from "@knownpath/observability";
import {
  CONTRIBUTION_CONTRACT_VERSION,
  agentContributionV2Schema,
  candidateExperienceSchema,
  contributionInspectionResponseSchema,
  contributionSubmissionRequestSchema,
  contributionSubmissionResponseSchema,
  createAgentContributionId,
  createCandidateExperienceId,
  createErrorFingerprint,
  createSourceItemId,
  createSourceRegistryId,
  createVersionedKey,
  normalizeEcosystem,
  normalizeInlineText,
  normalizePackageName,
  normalizePlatform,
  normalizeVersion,
  knowledgeSearchEventIdSchema,
  sourceItemSchema,
  sourceRegistrySchema,
  type AgentContributionV2,
  type ApiKeyId,
  type ContributionInspectionResponse,
  type ContributionPayload,
  type ContributionSubmissionRequest,
  type ContributionSubmissionResponse,
  type User,
  type UserId,
  type Visibility,
  type WorkspaceId,
} from "@knownpath/domain";
import { CandidateAssessmentService, defaultScoringPolicy } from "@knownpath/verification";

import { ContributionError } from "./errors.js";
import { assertContributionProviderVisibility, type ContributionGeneralizer } from "./provider.js";
import { sanitizeContributionPayload } from "./sanitizer.js";
import { assessContributionQuality } from "./quality.js";

const CONTRIBUTION_DIGEST_VERSION = 1;
const CONTRIBUTION_PROJECTOR_VERSION = 1;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface ContributionServiceOptions {
  readonly apiOrigin: string;
  readonly digestSecret: string;
  readonly generalizer?: ContributionGeneralizer;
  readonly defaultProcessingMode?: "inline" | "deferred";
  readonly enqueueProcessing?: (contribution: AgentContributionV2) => Promise<void>;
}

export interface ContributionActor {
  readonly user: User;
  readonly apiKeyId?: ApiKeyId;
  readonly channel?: "agent_api" | "dashboard_share";
  readonly workspaceId?: WorkspaceId;
}

export interface ContributionSubmissionResult {
  readonly contribution: AgentContributionV2;
  readonly response: ContributionSubmissionResponse;
}

export class ContributionService {
  private readonly apiOrigin: URL;

  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly options: ContributionServiceOptions,
  ) {
    this.apiOrigin = normalizeOrigin(options.apiOrigin);
    if (options.digestSecret.length < 32)
      throw new Error("Contribution digest secret must contain at least 32 characters");
  }

  public async submit(
    unparsedRequest: ContributionSubmissionRequest,
    actor: ContributionActor,
    signal: AbortSignal = new AbortController().signal,
    processingMode: "inline" | "deferred" = this.options.defaultProcessingMode ?? "inline",
  ): Promise<ContributionSubmissionResult> {
    const request = contributionSubmissionRequestSchema.parse(unparsedRequest);
    this.assertSubmissionAllowed(request, actor);
    await this.assertTargetAndDuplicateCheck(request, actor);
    const originalRequestDigest = digestOriginalRequest(request, this.options.digestSecret);
    const existing =
      await this.database.repositories.agentContributions.findV2ByOwnerAndClientSubmissionId(
        actor.user._id,
        request.clientSubmissionId,
      );
    if (existing !== null) {
      if (existing.originalRequestDigest.value !== originalRequestDigest)
        throw new ContributionError(
          "contribution_idempotency_conflict",
          "This clientSubmissionId was already used for different contribution content",
        );
      const processed =
        existing.status === "quarantined" || processingMode === "deferred"
          ? existing
          : await this.process(existing._id, signal);
      await this.enqueueIfDeferred(processed, processingMode);
      return { contribution: processed, response: toSubmissionResponse(processed, true) };
    }

    await this.assertRate(actor, new Date());

    const sanitized = await sanitizeContributionPayload(request.payload);
    const now = new Date();
    const visibility = contributionVisibility(
      request.visibility,
      actor.user._id,
      request.workspaceId,
    );
    const contribution = agentContributionV2Schema.parse({
      _id: createAgentContributionId(),
      schemaVersion: 2,
      clientSubmissionId: request.clientSubmissionId,
      contributor: {
        userId: actor.user._id,
        ...(actor.apiKeyId === undefined ? {} : { apiKeyId: actor.apiKeyId }),
        channel: actor.channel ?? "agent_api",
        agentClient: request.agentClient,
      },
      ...(request.knownPathId === undefined ? {} : { knownPathId: request.knownPathId }),
      kind: request.kind,
      contractVersion: request.contractVersion,
      relationship: request.relationship ?? relationshipForLegacyKind(request.kind),
      duplicateCheck: request.duplicateCheck ?? { status: "unavailable" },
      deduplicationKey: createVersionedKey([
        "agent-contribution-v2",
        actor.user._id,
        request.clientSubmissionId,
      ]),
      originalRequestDigest: { value: originalRequestDigest, version: CONTRIBUTION_DIGEST_VERSION },
      sanitizedContentDigest: sha256(stableJson(sanitized.payload)),
      payload: sanitized.payload,
      consent: {
        policyIdentifier: "knownpath-contribution-consent",
        policyVersion: request.consent.policyVersion,
        intent:
          request.visibility === "public"
            ? "public_submission_and_future_publication"
            : request.visibility === "team"
              ? "workspace_backend_storage"
              : "private_backend_storage",
        confirmedAt: now,
        confirmedByUserId: actor.user._id,
        visibility: request.visibility,
        ...(request.workspaceId === undefined ? {} : { workspaceId: request.workspaceId }),
      },
      sanitization: sanitized.report,
      status: sanitized.report.status === "quarantined" ? "quarantined" : "pending",
      trustState: "self_reported_unverified",
      processing: { stage: "stored" },
      visibility,
      moderation:
        sanitized.report.status === "quarantined"
          ? { status: "flagged", reason: "prompt_injection_language_detected" }
          : { status: "unreviewed" },
      audit: {
        createdAt: now,
        updatedAt: now,
        createdByUserId: actor.user._id,
        updatedByUserId: actor.user._id,
      },
    });
    const inserted =
      await this.database.repositories.agentContributions.createV2IfAbsent(contribution);
    if (inserted === null) {
      const raced =
        await this.database.repositories.agentContributions.findV2ByOwnerAndClientSubmissionId(
          actor.user._id,
          request.clientSubmissionId,
        );
      if (raced === null)
        throw new Error("Contribution insert raced but no record could be resolved");
      if (raced.originalRequestDigest.value !== originalRequestDigest)
        throw new ContributionError(
          "contribution_idempotency_conflict",
          "This clientSubmissionId was already used for different contribution content",
        );
      const processed =
        raced.status === "quarantined" || processingMode === "deferred"
          ? raced
          : await this.process(raced._id, signal);
      await this.enqueueIfDeferred(processed, processingMode);
      return { contribution: processed, response: toSubmissionResponse(processed, true) };
    }
    const processed =
      inserted.status === "quarantined" || processingMode === "deferred"
        ? inserted
        : await this.process(inserted._id, signal);
    await this.enqueueIfDeferred(processed, processingMode);
    recordContribution(processed.status, processed.visibility.scope);
    return { contribution: processed, response: toSubmissionResponse(processed, false) };
  }

  private async enqueueIfDeferred(
    contribution: AgentContributionV2,
    mode: "inline" | "deferred",
  ): Promise<void> {
    if (
      mode !== "deferred" ||
      this.options.enqueueProcessing === undefined ||
      contribution.status === "quarantined" ||
      contribution.processing.stage === "complete"
    )
      return;
    try {
      await this.options.enqueueProcessing(contribution);
    } catch {
      // The durable contribution remains stored; maintenance reconciliation dispatches its job.
    }
  }

  public async process(
    contributionId: AgentContributionV2["_id"],
    signal: AbortSignal = new AbortController().signal,
  ): Promise<AgentContributionV2> {
    let contribution = await this.findV2(contributionId);
    if (
      contribution.status === "quarantined" ||
      contribution.status === "rejected" ||
      (contribution.status === "accepted" &&
        contribution.moderation.status === "approved" &&
        contribution.processing.candidateExperienceId !== undefined) ||
      [
        "awaiting_moderation",
        "canonicalization_queued",
        "canonicalizing",
        "canonicalized",
        "complete",
      ].includes(contribution.processing.stage)
    )
      return contribution;
    try {
      throwIfAborted(signal);
      let payload = contribution.payload;
      if (this.options.generalizer !== undefined) {
        assertContributionProviderVisibility(
          contribution.visibility,
          this.options.generalizer.capability,
        );
        const generalized = await this.options.generalizer.generalize(payload, signal);
        payload = (await sanitizeContributionPayload(generalized)).payload;
      }
      const proposedQuality = assessContributionQuality({ ...contribution, payload });
      const existingQuality =
        await this.database.repositories.contributionQualityAssessments.findByIdempotencyKey(
          proposedQuality.idempotencyKey,
        );
      const quality =
        existingQuality ??
        (await this.database.repositories.contributionQualityAssessments.createIfAbsent(
          proposedQuality,
        )) ??
        (await this.database.repositories.contributionQualityAssessments.findByIdempotencyKey(
          proposedQuality.idempotencyKey,
        ));
      if (quality === null)
        throw new Error("Contribution quality assessment could not be resolved");
      const qualityUpdated =
        await this.database.repositories.agentContributions.applyQualityDecision(
          contribution._id,
          quality._id,
          quality.decision,
        );
      if (qualityUpdated === null)
        throw new Error("Contribution quality result could not be stored");
      contribution = qualityUpdated;
      recordContributionQuality(quality.decision, contribution.relationship);
      if (quality.decision === "rejected") return contribution;
      const registry = await this.ensureRegistry(contribution);
      const source = await this.ensureSource(contribution, registry._id, payload);
      contribution = await this.updateProcessing(contribution, {
        ...contribution.processing,
        stage: "source_created",
        sourceItemId: source._id,
      });
      const candidate = await this.ensureCandidate(contribution, source, payload);
      contribution = await this.updateProcessing(contribution, {
        ...contribution.processing,
        stage: "candidate_created",
        sourceItemId: source._id,
        candidateExperienceId: candidate._id,
      });
      const assessed = await new CandidateAssessmentService(
        this.database,
        defaultScoringPolicy,
      ).assess(candidate._id, { evaluatedAt: contribution.audit.createdAt });
      contribution = await this.updateProcessing(contribution, {
        ...contribution.processing,
        stage: "assessed",
        assessmentId: assessed.assessment._id,
      });
      const profiles = new SimilarityProfileService(this.database);
      const profile = await profiles.ensure(candidate);
      contribution = await this.updateProcessing(contribution, {
        ...contribution.processing,
        stage: "profiled",
        similarityProfileId: profile.profile._id,
      });
      await new CandidateDiscoveryService(
        this.database,
        profiles,
        new CandidatePairService(this.database),
      ).discoverForCandidate(candidate._id, false);
      return this.updateProcessing(contribution, {
        ...contribution.processing,
        stage: "awaiting_moderation",
      });
    } catch (error) {
      await this.updateProcessing(contribution, {
        ...contribution.processing,
        stage: "failed",
        failureCode: errorCode(error),
        failureMessage: "Contribution processing could not complete; it can be resumed safely",
      });
      throw error;
    }
  }

  public async inspect(
    contributionId: AgentContributionV2["_id"],
    requesterUserId: UserId,
  ): Promise<ContributionInspectionResponse> {
    const contribution = await this.findV2(contributionId);
    const allowed =
      contribution.visibility.scope === "team"
        ? (await this.database.repositories.workspaceMemberships.findActive(
            contribution.visibility.workspaceId,
            requesterUserId,
          )) !== null &&
          (
            await this.database.repositories.workspaces.findById(
              contribution.visibility.workspaceId,
            )
          )?.status === "active"
        : contribution.contributor.userId === requesterUserId;
    if (!allowed)
      throw new ContributionError(
        "contribution_owner_forbidden",
        "The contribution is not available to this principal",
      );
    const qualityAssessment =
      await this.database.repositories.contributionQualityAssessments.findLatestByContribution(
        contribution._id,
      );
    return contributionInspectionResponseSchema.parse({
      contributionId: contribution._id,
      clientSubmissionId: contribution.clientSubmissionId,
      kind: contribution.kind,
      relationship: contribution.relationship,
      duplicateCheck: contribution.duplicateCheck,
      ...(contribution.knownPathId === undefined ? {} : { knownPathId: contribution.knownPathId }),
      visibility: contribution.visibility.scope,
      consent: contribution.consent,
      payload: contribution.payload,
      sanitization: contribution.sanitization,
      status: contribution.status,
      trustState: contribution.trustState,
      processing: contribution.processing,
      ...(qualityAssessment === null ? {} : { qualityAssessment }),
      createdAt: contribution.audit.createdAt,
      updatedAt: contribution.audit.updatedAt,
    });
  }

  private assertSubmissionAllowed(
    request: ContributionSubmissionRequest,
    actor: ContributionActor,
  ): void {
    if (actor.user.contributionMode === "disabled")
      throw new ContributionError(
        "contribution_disabled",
        "Contributions are disabled for this account",
      );
    if (
      request.visibility === "team" &&
      (request.workspaceId === undefined || actor.workspaceId !== request.workspaceId)
    )
      throw new ContributionError(
        "contribution_owner_forbidden",
        "Team contributions require an API key bound to the requested active workspace",
      );
    if (request.visibility !== "team" && actor.workspaceId !== undefined)
      throw new ContributionError(
        "contribution_owner_forbidden",
        "A workspace-bound API key may submit only team contributions",
      );
    if (request.consent.confirmed !== true)
      throw new ContributionError(
        "contribution_consent_required",
        "Explicit contribution consent is required",
      );
  }

  private async assertTargetAndDuplicateCheck(
    request: ContributionSubmissionRequest,
    actor: ContributionActor,
  ): Promise<void> {
    if (request.knownPathId !== undefined) {
      const target = await this.database.repositories.knownPaths.findById(request.knownPathId);
      if (
        target === null ||
        !sameContributionVisibility(target.visibility, request, actor) ||
        (request.visibility === "public" && !["published", "deprecated"].includes(target.status))
      )
        throw new ContributionError(
          "contribution_target_forbidden",
          "The related KnownPath is not available in the requested contribution scope",
        );
    }
    const check = request.duplicateCheck;
    if (check?.status !== "performed" || check.searchId === undefined) return;
    const event = await this.database.repositories.knowledgeSearchEvents.findById(
      knowledgeSearchEventIdSchema.parse(check.searchId),
    );
    if (event === null || event.principal.userId !== actor.user._id)
      throw new ContributionError(
        "contribution_duplicate_check_invalid",
        "The final duplicate search could not be verified for this account",
      );
    const now = Date.now();
    if (event.createdAt.getTime() > now + 60_000 || event.createdAt.getTime() < now - 2 * HOUR_MS)
      throw new ContributionError(
        "contribution_duplicate_check_invalid",
        "The final duplicate search must have completed within the last two hours",
      );
    if (
      check.matchedKnownPathId !== undefined &&
      !event.results.some((result) => result.knownPathId === check.matchedKnownPathId)
    )
      throw new ContributionError(
        "contribution_duplicate_check_invalid",
        "The declared matching KnownPath was not returned by the referenced search",
      );
    const relationship = request.relationship ?? relationshipForLegacyKind(request.kind);
    if (
      (relationship === "novel" && check.matchedKnownPathId !== undefined) ||
      (relationship !== "novel" && check.matchedKnownPathId !== request.knownPathId)
    )
      throw new ContributionError(
        "contribution_duplicate_check_invalid",
        "The duplicate-search result does not match the declared contribution relationship",
      );
  }

  private async assertRate(actor: ContributionActor, now: Date): Promise<void> {
    const daily = await this.database.repositories.agentContributions.countRecentByUser(
      actor.user._id,
      new Date(now.getTime() - DAY_MS),
    );
    if (daily >= 20)
      throw new ContributionError(
        "contribution_abuse_limit",
        "This account has reached the daily contribution limit",
      );
    if (actor.apiKeyId !== undefined) {
      const hourly = await this.database.repositories.agentContributions.countRecentByApiKey(
        actor.apiKeyId,
        new Date(now.getTime() - HOUR_MS),
      );
      if (hourly >= 10)
        throw new ContributionError(
          "contribution_abuse_limit",
          "This machine credential has reached the hourly contribution limit",
        );
    }
  }

  private async ensureRegistry(contribution: AgentContributionV2) {
    const identityKey = createVersionedKey([
      "agent-contribution-registry",
      contribution.visibility.scope,
      contribution.visibility.scope === "private"
        ? contribution.visibility.ownerUserId
        : contribution.visibility.scope === "team"
          ? contribution.visibility.workspaceId
          : "public",
    ]);
    const existing =
      await this.database.repositories.sourceRegistries.findByIdentityKey(identityKey);
    if (existing !== null) return existing;
    const now = new Date();
    const registry = sourceRegistrySchema.parse({
      _id: createSourceRegistryId(),
      schemaVersion: 1,
      kind: "agent_contribution",
      name:
        contribution.visibility.scope === "public"
          ? "KnownPath public agent contributions"
          : contribution.visibility.scope === "team"
            ? "KnownPath workspace agent contributions"
            : "KnownPath private agent contributions",
      originalUrl: new URL("api/v1/contributions", this.apiOrigin).toString(),
      canonicalUrl: new URL("api/v1/contributions", this.apiOrigin).toString(),
      identityKey,
      enabled: true,
      ecosystemHints: [],
      configuration: { "source.key": `agent-contributions-${identityKey.value.slice(0, 16)}` },
      visibility: contribution.visibility,
      audit: { createdAt: now, updatedAt: now },
    });
    const inserted = await this.database.repositories.sourceRegistries.createIfAbsent(registry);
    if (inserted !== null) return inserted;
    const raced = await this.database.repositories.sourceRegistries.findByIdentityKey(identityKey);
    if (raced === null) throw new Error("Contribution source registry raced but was not found");
    return raced;
  }

  private async ensureSource(
    contribution: AgentContributionV2,
    sourceRegistryId: Parameters<typeof sourceItemSchema.parse>[0] extends never ? never : string,
    payload: ContributionPayload,
  ) {
    const text = renderSourceText(payload);
    const contentDigest = sha256(text);
    const deduplicationKey = createVersionedKey([
      "agent-contribution-source",
      contribution._id,
      contribution.sanitizedContentDigest,
    ]);
    const existing =
      await this.database.repositories.sourceItems.findByDeduplicationKey(deduplicationKey);
    if (existing !== null) return existing;
    const now = new Date();
    const item = sourceItemSchema.parse({
      _id: createSourceItemId(),
      schemaVersion: 1,
      sourceRegistryId,
      itemType: "agent_contribution",
      title: payload.problem.slice(0, 300),
      provenance: {
        canonicalUrl: new URL(
          `api/v1/contributions/${contribution._id}`,
          this.apiOrigin,
        ).toString(),
        sourceItemIdentity: contribution._id,
        observedRevision: contribution.sanitizedContentDigest,
        observedAt: contribution.audit.createdAt,
      },
      providerMetadata: {
        provider: "knownpath-agent-contribution",
        formatVersion: 1,
        payload: {
          contributionId: contribution._id,
          consentPolicyVersion: contribution.consent.policyVersion,
          sanitizerVersion: contribution.sanitization.sanitizerVersion,
          trustState: contribution.trustState,
        },
      },
      sourceQuality: {
        authority: "general_public",
        classificationBasis: "unverified",
        publisher: "KnownPath agent contribution",
      },
      content: {
        digest: contentDigest,
        mediaType: "text/markdown",
        text,
        byteLength: Buffer.byteLength(text, "utf8"),
      },
      deduplicationKey,
      capturedAt: now,
      visibility: contribution.visibility,
      audit: { createdAt: now, updatedAt: now },
    });
    const inserted = await this.database.repositories.sourceItems.createIfAbsent(item);
    if (inserted !== null) return inserted;
    const raced =
      await this.database.repositories.sourceItems.findByDeduplicationKey(deduplicationKey);
    if (raced === null) throw new Error("Contribution source insert raced but was not found");
    return raced;
  }

  private async ensureCandidate(
    contribution: AgentContributionV2,
    source: Awaited<ReturnType<ContributionService["ensureSource"]>>,
    payload: ContributionPayload,
  ) {
    const qualityAssessmentId = contribution.processing.qualityAssessmentId;
    if (qualityAssessmentId === undefined)
      throw new Error("Contribution candidate projection requires a quality assessment");
    const deduplicationKey = createVersionedKey([
      "agent-contribution-candidate",
      contribution._id,
      contribution.sanitizedContentDigest,
      String(CONTRIBUTION_PROJECTOR_VERSION),
    ]);
    const existing =
      await this.database.repositories.candidateExperiences.findByDeduplicationKey(
        deduplicationKey,
      );
    if (existing !== null) return existing;
    const errorSignatures = payload.errors.map((error) => {
      const normalized = normalizeInlineText(error);
      return { original: error, normalized, fingerprint: createErrorFingerprint(normalized) };
    });
    const now = new Date();
    const candidate = candidateExperienceSchema.parse({
      _id: createCandidateExperienceId(),
      schemaVersion: 1,
      status: "pending",
      deduplicationKey,
      problemSummary: payload.problem,
      symptoms: payload.symptoms.map((summary) => ({
        summary,
        normalizedText: normalizeInlineText(summary),
        evidenceSourceItemIds: [source._id],
      })),
      errorSignatures,
      errorFingerprints: [...new Set(errorSignatures.map((entry) => entry.fingerprint.value))],
      solutionSummary: payload.solutionSummary,
      solutionSteps: payload.steps.map((step, index) => ({
        order: index + 1,
        instruction: step.instruction,
        ...(step.verification === undefined ? {} : { verification: step.verification }),
        evidenceSourceItemIds: [source._id],
      })),
      metadata: {
        primaryEcosystem: normalizeEcosystem(payload.ecosystem),
        ...(payload.packages[0] === undefined
          ? {}
          : {
              primaryPackageName: normalizePackageName(
                payload.packages[0].ecosystem,
                payload.packages[0].name,
              ),
            }),
        packages: payload.packages.map((item) => ({
          ecosystem: normalizeEcosystem(item.ecosystem),
          name: item.name,
          normalizedName: normalizePackageName(item.ecosystem, item.name),
          ...(item.version === undefined ? {} : { version: normalizeVersion(item.version) }),
          role: "affected" as const,
        })),
        platforms: [...new Set(payload.platforms.map(normalizePlatform))],
        versionStrings: [...new Set(payload.versions.map(normalizeVersion))],
        environment: {
          runtimes: payload.environment.runtimes,
          operatingSystems: payload.environment.operatingSystems,
          architectures: payload.environment.architectures,
          frameworks: payload.environment.frameworks,
          toolchain: payload.toolchain,
          extensions: { buildModes: payload.environment.buildModes.join(",") },
        },
      },
      evidence: [
        {
          sourceItemId: source._id,
          relationship: "supports_solution",
          canonicalUrl: source.provenance.canonicalUrl,
          contentDigest: source.content.digest,
          locator: "sanitized agent contribution",
          excerpt: payload.solutionSummary,
        },
      ],
      visibility: contribution.visibility,
      moderation: { status: "unreviewed" },
      audit: { createdAt: now, updatedAt: now, createdByUserId: contribution.contributor.userId },
      attemptedApproaches: [],
      caveats: [
        ...payload.caveats,
        ...(payload.applicability?.doesNotApplyWhen.map(
          (condition) => `Does not apply when: ${condition}`,
        ) ?? []),
      ],
      conflicts: [],
      candidateVerificationLabels: [],
      contribution: {
        contributionId: contribution._id,
        sourceItemId: source._id,
        projectorIdentifier: "knownpath-contribution-projector",
        projectorVersion: CONTRIBUTION_PROJECTOR_VERSION,
        sanitizedContentDigest: contribution.sanitizedContentDigest,
        projectedAt: now,
        relationship: contribution.relationship,
        qualityAssessmentId,
      },
      ...(payload.rootCause === undefined
        ? {}
        : { rootCause: { summary: payload.rootCause, evidenceSourceItemIds: [source._id] } }),
    });
    const inserted =
      await this.database.repositories.candidateExperiences.createIfAbsent(candidate);
    if (inserted !== null) return inserted;
    const raced =
      await this.database.repositories.candidateExperiences.findByDeduplicationKey(
        deduplicationKey,
      );
    if (raced === null) throw new Error("Contribution candidate raced but was not found");
    return raced;
  }

  private async findV2(id: AgentContributionV2["_id"]): Promise<AgentContributionV2> {
    const contribution = await this.database.repositories.agentContributions.findById(id);
    if (contribution === null || contribution.schemaVersion !== 2)
      throw new ContributionError(
        "contribution_not_found",
        "The requested contribution was not found",
      );
    return contribution;
  }

  private async updateProcessing(
    contribution: AgentContributionV2,
    processing: AgentContributionV2["processing"],
  ): Promise<AgentContributionV2> {
    const updated = await this.database.repositories.agentContributions.updateProcessing(
      contribution._id,
      processing,
    );
    if (updated === null) throw new Error("Contribution processing state could not be updated");
    return updated;
  }
}

function contributionVisibility(
  scope: "public" | "private" | "team",
  userId: UserId,
  workspaceId: WorkspaceId | undefined,
): Visibility {
  if (scope === "public") return { scope: "public" };
  if (scope === "private") return { scope: "private", ownerUserId: userId };
  if (workspaceId === undefined) throw new Error("Team contribution workspaceId was not validated");
  return { scope: "team", workspaceId };
}

function digestOriginalRequest(request: ContributionSubmissionRequest, secret: string): string {
  return createHmac("sha256", secret)
    .update("knownpath:contribution-request:v1\0", "utf8")
    .update(stableJson(request), "utf8")
    .digest("hex");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function renderSourceText(payload: ContributionPayload): string {
  return [
    "# Problem",
    payload.problem,
    "# Symptoms",
    ...payload.symptoms.map((value) => `- ${value}`),
    ...(payload.errors.length === 0
      ? []
      : ["# Errors", ...payload.errors.map((value) => `- ${value}`)]),
    ...(payload.rootCause === undefined ? [] : ["# Root cause", payload.rootCause]),
    "# Applicability",
    payload.applicability?.appliesWhen ?? "Not specified",
    ...(payload.applicability?.doesNotApplyWhen.length
      ? [
          "Does not apply when:",
          ...payload.applicability.doesNotApplyWhen.map((value) => `- ${value}`),
        ]
      : []),
    "# Environment",
    `Ecosystem: ${payload.ecosystem}`,
    ...(payload.packages.length === 0
      ? []
      : [
          `Packages: ${payload.packages
            .map(
              (item) =>
                `${item.ecosystem}:${item.name}${item.version === undefined ? "" : `@${item.version}`}`,
            )
            .join(", ")}`,
        ]),
    ...(payload.platforms.length === 0 ? [] : [`Platforms: ${payload.platforms.join(", ")}`]),
    ...(payload.versions.length === 0 ? [] : [`Versions: ${payload.versions.join(", ")}`]),
    ...(payload.toolchain.length === 0 ? [] : [`Toolchain: ${payload.toolchain.join(", ")}`]),
    "# Solution",
    payload.solutionSummary,
    "# Steps",
    ...payload.steps.map((step, index) => `${index + 1}. ${step.instruction}`),
    "# Observed success evidence (self-reported)",
    `Verification type: ${payload.verificationType}`,
    payload.successEvidence.summary,
    ...payload.successEvidence.checks.map((value) => `- ${value}`),
    ...(payload.caveats.length === 0
      ? []
      : ["# Caveats", ...payload.caveats.map((value) => `- ${value}`)]),
  ].join("\n\n");
}

function normalizeOrigin(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "")
    throw new Error("Contribution API origin must be a credential-free HTTP(S) URL");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Contribution processing cancelled");
}

function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code).slice(0, 256)
    : "contribution_processing_failed";
}

function toSubmissionResponse(
  contribution: AgentContributionV2,
  reused: boolean,
): ContributionSubmissionResponse {
  return contributionSubmissionResponseSchema.parse({
    contractVersion: CONTRIBUTION_CONTRACT_VERSION,
    contributionId: contribution._id,
    reused,
    visibility: contribution.visibility.scope,
    status: contribution.status,
    trustState: contribution.trustState,
    processingStage: contribution.processing.stage,
    sanitization: {
      status: contribution.sanitization.status,
      categories: [
        ...new Set(contribution.sanitization.findings.map((finding) => finding.category)),
      ],
      findingCount: contribution.sanitization.findings.reduce(
        (sum, finding) => sum + finding.count,
        0,
      ),
    },
    ...(contribution.processing.candidateExperienceId === undefined
      ? {}
      : { candidateExperienceId: contribution.processing.candidateExperienceId }),
    ...(contribution.processing.assessmentId === undefined
      ? {}
      : { assessmentId: contribution.processing.assessmentId }),
    ...(contribution.processing.qualityAssessmentId === undefined
      ? {}
      : { qualityAssessmentId: contribution.processing.qualityAssessmentId }),
  });
}

function relationshipForLegacyKind(kind: ContributionSubmissionRequest["kind"]) {
  if (kind === "correction") return "correction" as const;
  if (kind === "additional_evidence") return "corroboration" as const;
  if (kind === "freshness_update") return "extension" as const;
  return "novel" as const;
}

function sameContributionVisibility(
  visibility: Visibility,
  request: ContributionSubmissionRequest,
  actor: ContributionActor,
): boolean {
  if (request.visibility === "public") return visibility.scope === "public";
  if (request.visibility === "private")
    return visibility.scope === "private" && visibility.ownerUserId === actor.user._id;
  return visibility.scope === "team" && visibility.workspaceId === request.workspaceId;
}
