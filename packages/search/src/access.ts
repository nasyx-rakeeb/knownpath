import { createHmac, timingSafeEqual } from "node:crypto";

import type { KnownPathDatabase } from "@knownpath/database";
import {
  CURRENT_SCHEMA_VERSION,
  KNOWLEDGE_API_CONTRACT_VERSION,
  createAuditEventId,
  createKnowledgeSearchEventId,
  knowledgeSearchRequestSchema,
  knowledgeSearchResponseSchema,
  knownPathAlternativesResponseSchema,
  knownPathDetailResponseSchema,
  type EvidenceReference,
  type KnowledgeAccessMode,
  type KnowledgeSearchEvent,
  type KnowledgeSearchEventId,
  type KnowledgeSearchPrincipal,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
  type KnownPath,
  type KnownPathAlternativesResponse,
  type KnownPathDetailResponse,
  type KnownPathId,
  type SafeProvenance,
  type OutcomeAssessment,
  type SourceItem,
  type SourceRegistry,
} from "@knownpath/domain";

import type { RetrievalService } from "./service.js";

const DIGEST_VERSION = 2;
const CURSOR_VERSION = 1;

export interface KnowledgeRequestContext {
  readonly accessMode: KnowledgeAccessMode;
  readonly principal: KnowledgeSearchPrincipal;
  readonly requestId: string;
  readonly ipAddress?: string;
}

export interface KnowledgeAccessServiceOptions {
  readonly secret: string;
}

export class KnowledgeAccessError extends Error {
  public constructor(
    public readonly code:
      | "invalid_cursor"
      | "knowledge_not_found"
      | "search_event_not_found"
      | "selection_not_in_results"
      | "selection_conflict",
    message: string,
    public readonly statusCode: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "KnowledgeAccessError";
  }
}

export class KnowledgeAccessService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly retrieval: RetrievalService,
    private readonly options: KnowledgeAccessServiceOptions,
  ) {
    if (options.secret.length < 32)
      throw new Error("Knowledge access secret must be at least 32 characters");
  }

  public async search(
    input: unknown,
    context: KnowledgeRequestContext,
  ): Promise<KnowledgeSearchResponse> {
    const request = knowledgeSearchRequestSchema.parse(input);
    assertModeMatchesRequest(request, context.accessMode);
    const retrieval = await this.retrieval.search({
      text: request.text,
      errors: request.errors,
      ...(request.ecosystem === undefined ? {} : { ecosystem: request.ecosystem }),
      packages: request.packages,
      versions: request.versions,
      platforms: request.platforms,
      environment: request.environment,
      context: request.context,
      queryVisibility: "public",
      allowedStatuses: context.accessMode === "review" ? ["published", "review"] : ["published"],
      semanticMode: request.semanticMode,
      limit: request.limit,
      minimumScore: request.minimumScore,
    });
    const records = await this.database.repositories.knownPaths.findManyByIds(
      retrieval.results.map((result) => result.knownPathId),
    );
    const recordsById = new Map(records.map((record) => [record._id, record]));
    const outcomeAssessments = await this.database.repositories.outcomeAssessments.findManyByIds(
      records.flatMap((record) =>
        record.latestOutcomeAssessmentId === undefined ? [] : [record.latestOutcomeAssessmentId],
      ),
    );
    const outcomeAssessmentsById = new Map(outcomeAssessments.map((value) => [value._id, value]));
    const safeResults = [];
    for (const result of retrieval.results) {
      const record = recordsById.get(result.knownPathId);
      if (record === undefined || !isAccessible(record, context.accessMode)) continue;
      const provenance = await this.safeProvenance(record.evidence, 12);
      safeResults.push({
        id: record._id,
        title: result.title,
        problemSummary: result.problemSummary,
        solutionSummary: result.solutionSummary,
        status: record.status,
        applicability: toApplicability(record.metadata),
        caveats: unique(record.solutionVariants.flatMap((variant) => variant.caveats)).slice(0, 64),
        trust: toTrust(record.trust.score, record.trust.grade),
        freshness: toFreshness(record),
        outcomes: toSafeOutcomes(
          record.latestOutcomeAssessmentId === undefined
            ? null
            : (outcomeAssessmentsById.get(record.latestOutcomeAssessmentId) ?? null),
        ),
        relevance: {
          score: result.score.finalScore,
          versionCompatibility: result.score.versionCompatibility,
          matchedBy: result.matchedBy,
          components: result.score.components,
          penalties: result.score.penalties.map(({ code, points }) => ({ code, points })),
          reasonCodes: result.score.reasonCodes,
          explanations: result.score.explanations,
        },
        provenance,
      });
    }
    const now = new Date();
    const searchId = createKnowledgeSearchEventId();
    const event: KnowledgeSearchEvent = {
      _id: searchId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      principal: context.principal,
      accessMode: context.accessMode,
      requestId: context.requestId,
      queryDigest: this.digestQuery(request),
      digestVersion: DIGEST_VERSION,
      querySummary: {
        ...(request.ecosystem === undefined ? {} : { ecosystem: request.ecosystem }),
        packageCount: request.packages.length,
        versionCount: request.versions.length,
        platformCount: request.platforms.length,
        errorCount: request.errors.length,
        semanticMode: request.semanticMode,
      },
      results: safeResults.map((result, index) => ({
        knownPathId: result.id,
        rank: index + 1,
        score: result.relevance.score,
      })),
      createdAt: now,
      audit: { createdAt: now, updatedAt: now },
    };
    await this.database.repositories.knowledgeSearchEvents.create(event);
    if (context.accessMode === "review") {
      await this.recordReviewAudit("knowledge.review_searched", searchId, context, {
        resultCount: String(safeResults.length),
      });
    }
    return knowledgeSearchResponseSchema.parse({
      contractVersion: KNOWLEDGE_API_CONTRACT_VERSION,
      searchId,
      accessMode: context.accessMode,
      capabilities: retrieval.capabilities,
      results: safeResults,
    });
  }

  public async getById(
    id: KnownPathId,
    context: KnowledgeRequestContext,
  ): Promise<KnownPathDetailResponse> {
    const record = await this.database.repositories.knownPaths.findById(id);
    if (record === null || !isAccessible(record, context.accessMode)) throw notFound();
    if (record.status === "review") {
      await this.recordReviewAudit("knowledge.review_read", id, context);
    }
    const outcomeAssessment =
      record.latestOutcomeAssessmentId === undefined
        ? null
        : await this.database.repositories.outcomeAssessments.findById(
            record.latestOutcomeAssessmentId,
          );
    return knownPathDetailResponseSchema.parse({
      contractVersion: KNOWLEDGE_API_CONTRACT_VERSION,
      id: record._id,
      title: record.title,
      problemSummary: record.problemSummary,
      status: record.status,
      symptoms: record.symptoms.map((symptom) => ({
        summary: symptom.summary,
        ...(symptom.category === undefined ? {} : { category: symptom.category }),
      })),
      errors: record.errorSignatures.map((signature) => ({ normalized: signature.normalized })),
      applicability: toApplicability(record.metadata),
      solutions: record.solutionVariants.map((variant) => this.toSolution(record, variant)),
      trust: toTrust(record.trust.score, record.trust.grade),
      freshness: toFreshness(record),
      outcomes: toSafeOutcomes(outcomeAssessment),
      provenance: await this.safeProvenance(record.evidence, 512),
    });
  }

  public async alternatives(
    id: KnownPathId,
    cursor: string | undefined,
    limit: number,
    context: KnowledgeRequestContext,
  ): Promise<KnownPathAlternativesResponse> {
    const record = await this.database.repositories.knownPaths.findById(id);
    if (record === null || !isAccessible(record, context.accessMode)) throw notFound();
    if (record.status === "review") {
      await this.recordReviewAudit("knowledge.review_read", id, context, {
        resource: "alternatives",
      });
    }
    const alternatives = record.solutionVariants.slice(1);
    const start = cursor === undefined ? 0 : this.decodeCursor(cursor, id, alternatives);
    const page = alternatives.slice(start, start + limit);
    const nextIndex = start + page.length;
    return knownPathAlternativesResponseSchema.parse({
      contractVersion: KNOWLEDGE_API_CONTRACT_VERSION,
      knownPathId: id,
      items: page.map((variant) => this.toSolution(record, variant)),
      nextCursor:
        nextIndex < alternatives.length
          ? this.encodeCursor(id, this.solutionId(id, alternatives[nextIndex - 1]!.key.value))
          : null,
    });
  }

  public async recordSelection(
    searchId: KnowledgeSearchEventId,
    knownPathId: KnownPathId,
    context: KnowledgeRequestContext,
  ): Promise<{
    contractVersion: typeof KNOWLEDGE_API_CONTRACT_VERSION;
    searchId: KnowledgeSearchEventId;
    knownPathId: KnownPathId;
    recordedAt: string;
  }> {
    const event = await this.database.repositories.knowledgeSearchEvents.findById(searchId);
    if (event === null || !samePrincipal(event.principal, context.principal)) {
      throw new KnowledgeAccessError(
        "search_event_not_found",
        "The referenced search event was not found",
        404,
      );
    }
    const result = event.results.find((entry) => entry.knownPathId === knownPathId);
    if (result === undefined) {
      throw new KnowledgeAccessError(
        "selection_not_in_results",
        "The selected KnownPath was not returned by this search",
        400,
      );
    }
    if (event.selected !== undefined) {
      if (event.selected.knownPathId !== knownPathId) {
        throw new KnowledgeAccessError(
          "selection_conflict",
          "This search already has a different recorded selection",
          409,
        );
      }
      return {
        contractVersion: KNOWLEDGE_API_CONTRACT_VERSION,
        searchId,
        knownPathId,
        recordedAt: event.selected.recordedAt.toISOString(),
      };
    }
    const recordedAt = new Date();
    const updated = await this.database.repositories.knowledgeSearchEvents.recordSelection(
      searchId,
      context.principal,
      {
        knownPathId,
        rank: result.rank,
        recordedAt,
        requestId: context.requestId,
      },
    );
    if (updated === null) {
      const concurrent = await this.database.repositories.knowledgeSearchEvents.findById(searchId);
      if (concurrent !== null && samePrincipal(concurrent.principal, context.principal)) {
        if (concurrent.selected?.knownPathId === knownPathId) {
          return {
            contractVersion: KNOWLEDGE_API_CONTRACT_VERSION,
            searchId,
            knownPathId,
            recordedAt: concurrent.selected.recordedAt.toISOString(),
          };
        }
        if (concurrent.selected !== undefined) {
          throw new KnowledgeAccessError(
            "selection_conflict",
            "This search already has a different recorded selection",
            409,
          );
        }
      }
      throw new KnowledgeAccessError(
        "search_event_not_found",
        "The referenced search event was not found",
        404,
      );
    }
    return {
      contractVersion: KNOWLEDGE_API_CONTRACT_VERSION,
      searchId,
      knownPathId,
      recordedAt: recordedAt.toISOString(),
    };
  }

  private digestQuery(request: KnowledgeSearchRequest): string {
    return createHmac("sha256", this.options.secret)
      .update("knownpath:knowledge-query:v1\0")
      .update(JSON.stringify(canonicalQuery(request)))
      .digest("hex");
  }

  private solutionId(knownPathId: KnownPathId, key: string): string {
    return createHmac("sha256", this.options.secret)
      .update(`solution:${knownPathId}:${key}`)
      .digest("base64url");
  }

  private toSolution(record: KnownPath, variant: KnownPath["solutionVariants"][number]) {
    return {
      id: this.solutionId(record._id, variant.key.value),
      summary: variant.summary,
      steps: variant.steps.map((step) => ({
        order: step.order,
        ...(step.title === undefined ? {} : { title: step.title }),
        instruction: step.instruction,
        ...(step.code === undefined ? {} : { code: step.code.slice(0, 20_000) }),
        ...(step.language === undefined ? {} : { language: step.language }),
        ...(step.verification === undefined
          ? {}
          : { verification: step.verification.slice(0, 5_000) }),
      })),
      caveats: variant.caveats,
      applicability: toApplicability(variant.applicability),
      trust: toTrust(variant.trust.score, variant.trust.grade),
    };
  }

  private encodeCursor(knownPathId: KnownPathId, after: string): string {
    const payload = Buffer.from(
      JSON.stringify({ version: CURSOR_VERSION, knownPathId, after }),
    ).toString("base64url");
    const signature = createHmac("sha256", this.options.secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
  }

  private decodeCursor(
    cursor: string,
    knownPathId: KnownPathId,
    variants: KnownPath["solutionVariants"],
  ): number {
    try {
      const [payload, suppliedSignature, extra] = cursor.split(".");
      if (payload === undefined || suppliedSignature === undefined || extra !== undefined)
        throw new Error("malformed cursor");
      const expected = createHmac("sha256", this.options.secret)
        .update(payload)
        .digest("base64url");
      const suppliedBuffer = Buffer.from(suppliedSignature);
      const expectedBuffer = Buffer.from(expected);
      if (
        suppliedBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(suppliedBuffer, expectedBuffer)
      )
        throw new Error("invalid cursor signature");
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
      if (
        typeof decoded !== "object" ||
        decoded === null ||
        !("version" in decoded) ||
        decoded.version !== CURSOR_VERSION ||
        !("knownPathId" in decoded) ||
        decoded.knownPathId !== knownPathId ||
        !("after" in decoded) ||
        typeof decoded.after !== "string"
      )
        throw new Error("invalid cursor payload");
      const position = variants.findIndex(
        (variant) => this.solutionId(knownPathId, variant.key.value) === decoded.after,
      );
      if (position < 0) throw new Error("cursor position no longer exists");
      return position + 1;
    } catch {
      throw new KnowledgeAccessError("invalid_cursor", "The pagination cursor is invalid", 400);
    }
  }

  private async safeProvenance(
    references: readonly EvidenceReference[],
    limit: number,
  ): Promise<SafeProvenance[]> {
    const uniqueReferences = new Map(
      references.map((reference) => [reference.sourceItemId, reference]),
    );
    const sourceItems = await this.database.repositories.sourceItems.findByIds([
      ...uniqueReferences.keys(),
    ]);
    const registryIds = [...new Set(sourceItems.map((item) => item.sourceRegistryId))];
    const registries = await Promise.all(
      registryIds.map((id) => this.database.repositories.sourceRegistries.findById(id)),
    );
    const registriesById = new Map(
      registries
        .filter((registry): registry is SourceRegistry => registry !== null)
        .map((registry) => [registry._id, registry]),
    );
    return sourceItems
      .filter((item) => item.visibility.scope === "public")
      .flatMap((item) => {
        const reference = uniqueReferences.get(item._id);
        const registry = registriesById.get(item.sourceRegistryId);
        if (
          reference === undefined ||
          registry === undefined ||
          registry.visibility.scope !== "public"
        )
          return [];
        return [toSafeProvenance(item, registry, reference)];
      })
      .slice(0, limit);
  }

  private async recordReviewAudit(
    eventType: "knowledge.review_searched" | "knowledge.review_read",
    targetId: string,
    context: KnowledgeRequestContext,
    metadata?: Readonly<Record<string, string>>,
  ): Promise<void> {
    if (context.principal.kind !== "api_key") throw new Error("Review audit requires an API key");
    await this.database.repositories.auditEvents.create({
      _id: createAuditEventId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      eventType,
      occurredAt: new Date(),
      actor: {
        kind: "api_key",
        userId: context.principal.userId,
        apiKeyId: context.principal.apiKeyId,
      },
      target: {
        kind: eventType === "knowledge.review_searched" ? "knowledge_search" : "known_path",
        id: targetId,
      },
      outcome: "success",
      requestId: context.requestId,
      ...safeIpAddress(context.ipAddress),
      ...(metadata === undefined ? {} : { metadata: { ...metadata } }),
    });
  }
}

function assertModeMatchesRequest(
  request: KnowledgeSearchRequest,
  accessMode: KnowledgeAccessMode,
): void {
  if (request.includeReview !== (accessMode === "review")) {
    throw new Error("Authorized knowledge access mode does not match the validated request");
  }
}

function isAccessible(record: KnownPath, mode: KnowledgeAccessMode): boolean {
  if (record.visibility.scope !== "public") return false;
  return mode === "review"
    ? record.status === "published" || record.status === "review"
    : record.status === "published";
}

function notFound(): KnowledgeAccessError {
  return new KnowledgeAccessError(
    "knowledge_not_found",
    "The requested KnownPath was not found",
    404,
  );
}

function canonicalQuery(request: KnowledgeSearchRequest) {
  return {
    text: request.text,
    errors: [...request.errors],
    ecosystem: request.ecosystem ?? null,
    packages: [...request.packages].sort(),
    versions: [...request.versions].sort((left, right) =>
      `${left.subject}:${left.value}`.localeCompare(`${right.subject}:${right.value}`),
    ),
    platforms: [...request.platforms].sort(),
    environment: [...request.environment].sort(),
    context: request.context,
    semanticMode: request.semanticMode,
    limit: request.limit,
    minimumScore: request.minimumScore,
    includeReview: request.includeReview,
  };
}

function samePrincipal(left: KnowledgeSearchPrincipal, right: KnowledgeSearchPrincipal): boolean {
  return (
    left.kind === right.kind &&
    left.userId === right.userId &&
    (left.kind !== "api_key" || (right.kind === "api_key" && left.apiKeyId === right.apiKeyId))
  );
}

function toApplicability(metadata: KnownPath["metadata"]) {
  return {
    ecosystem: metadata.primaryEcosystem,
    packages: metadata.packages.map((entry) => ({
      name: entry.normalizedName,
      ...(entry.version === undefined ? {} : { version: entry.version }),
      role: entry.role,
    })),
    platforms: metadata.platforms,
    versions: metadata.versionStrings,
    runtimes: metadata.environment.runtimes,
    operatingSystems: metadata.environment.operatingSystems,
    frameworks: metadata.environment.frameworks,
    toolchain: metadata.environment.toolchain,
  };
}

function toTrust(score: number, grade: KnownPath["trust"]["grade"]) {
  return {
    score,
    grade,
    explanation: `Deterministic evidence assessment: ${grade.replaceAll("_", " ")} (${score}/100).`,
  };
}

function toFreshness(record: KnownPath) {
  const now = Date.now();
  const staleAfter = record.freshness.staleAfter;
  const lastVerifiedAt = record.freshness.lastVerifiedAt;
  const status =
    staleAfter !== undefined && staleAfter.getTime() < now
      ? "stale"
      : lastVerifiedAt === undefined
        ? "unknown"
        : now - lastVerifiedAt.getTime() > 180 * 24 * 60 * 60 * 1_000
          ? "aging"
          : "current";
  return {
    status,
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt: lastVerifiedAt.toISOString() }),
    ...(staleAfter === undefined ? {} : { staleAfter: staleAfter.toISOString() }),
  };
}

function toSafeOutcomes(assessment: OutcomeAssessment | null) {
  if (assessment === null || assessment.confidence.status === "unobserved")
    return {
      status: "unobserved" as const,
      explanation: "No eligible attempted outcome evidence is available.",
    };
  if (assessment.counts.uniqueUsers < 3)
    return {
      status: "limited" as const,
      effectiveSampleSize: assessment.recency.effectiveSampleSize,
      explanation:
        "Outcome evidence exists, but detailed aggregates remain hidden until three independent accounts have reported.",
    };
  return {
    status: "observed" as const,
    confidenceScore: assessment.confidence.score,
    confidenceGrade: assessment.confidence.grade,
    effectiveSampleSize: assessment.recency.effectiveSampleSize,
    recentSuccesses: assessment.counts.recentSuccesses,
    solved: assessment.counts.solved,
    partiallyHelped: assessment.counts.partiallyHelped,
    attemptedFailed: assessment.counts.attemptedFailed,
    incompatibleEnvironment: assessment.counts.incompatibleEnvironment,
    staleOrOutdated: assessment.counts.staleOrOutdated,
    ...(assessment.lastSuccessfulAt === undefined
      ? {}
      : { lastSuccessfulAt: assessment.lastSuccessfulAt.toISOString() }),
    trend: assessment.trend.status,
    explanation:
      "Aggregate outcome confidence uses time-decayed Wilson lower bounds and one effective report per account/version window.",
  };
}

function toSafeProvenance(
  item: SourceItem,
  registry: SourceRegistry,
  reference: EvidenceReference,
): SafeProvenance {
  return {
    sourceItemId: item._id,
    canonicalUrl: reference.canonicalUrl ?? item.provenance.canonicalUrl,
    ...(item.title === undefined ? {} : { title: item.title.slice(0, 500) }),
    itemType: item.itemType,
    sourceKind: registry.kind,
    authority: item.sourceQuality?.authority ?? "general_public",
    publisher: item.sourceQuality?.publisher ?? registry.name,
    relationship: reference.relationship,
    ...(reference.locator === undefined ? {} : { locator: reference.locator.slice(0, 500) }),
    ...(reference.excerpt === undefined ? {} : { excerpt: reference.excerpt.slice(0, 1_000) }),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function safeIpAddress(value: string | undefined): { ipAddress?: string } {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length < 2
    ? {}
    : { ipAddress: normalized.slice(0, 128) };
}
