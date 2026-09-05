import { createHash } from "node:crypto";

import type { KnownPathDatabase } from "@knownpath/database";
import { recordOutcome } from "@knownpath/observability";
import {
  CURRENT_SCHEMA_VERSION,
  OUTCOME_CONTRACT_VERSION,
  agentOutcomeV2Schema,
  createAgentOutcomeId,
  createOutcomeAssessmentId,
  createSafetyEventId,
  createVersionedKey,
  normalizeEcosystem,
  normalizeInlineText,
  normalizePackageName,
  normalizePlatform,
  normalizeVersion,
  outcomeAssessmentSchema,
  outcomeSubmissionRequestSchema,
  outcomeSubmissionResponseSchema,
  safetyEventSchema,
  type AgentOutcomeV2,
  type ApiKeyId,
  type KnownPathId,
  type OutcomeAssessment,
  type OutcomeSubmissionRequest,
  type OutcomeSubmissionResponse,
  type OutcomeAggregationScope,
  type OutcomeTargetScope,
  type UserId,
  type WorkspaceId,
  type RetrievalAccess,
} from "@knownpath/domain";
import { sanitizePrivacyText } from "@knownpath/privacy";

import { OutcomeError } from "./errors.js";
import { outcomePolicyDigest, outcomePolicyV1 } from "./policy.js";

const DAY_MS = 86_400_000;

export interface OutcomePrincipal {
  readonly userId: UserId;
  readonly apiKeyId: ApiKeyId;
  readonly accessMode: "published" | "review";
  readonly scope: OutcomeTargetScope;
  readonly workspaceId?: WorkspaceId;
}

export class OutcomeService {
  public constructor(private readonly database: KnownPathDatabase) {}

  public async submit(
    unparsed: unknown,
    principal: OutcomePrincipal,
    now = new Date(),
  ): Promise<OutcomeSubmissionResponse> {
    const request = outcomeSubmissionRequestSchema.parse(unparsed);
    this.assertAttemptTime(request, now);
    if (JSON.stringify(request.scope) !== JSON.stringify(principal.scope))
      throw new OutcomeError(
        "outcome_target_not_accessible",
        "Authorized outcome scope does not match the request",
      );
    const targetAccess = outcomeTargetAccess(request.scope, principal.userId);
    const knownPath = await this.database.repositories.knownPaths.findAccessibleById(
      request.knownPathId,
      [targetAccess],
    );
    const allowedStatuses =
      principal.accessMode === "review" || request.scope.kind !== "public"
        ? ["review", "published", "deprecated"]
        : ["published"];
    if (
      knownPath === null ||
      knownPath.latestRevisionId === undefined ||
      !allowedStatuses.includes(knownPath.status)
    )
      throw new OutcomeError(
        "outcome_target_not_accessible",
        "The target KnownPath is not accessible for outcome reporting",
      );
    const aggregationScope = outcomeAggregationScope(principal);
    const digest = sha256(stableJson(request));
    const replay = await this.database.repositories.agentOutcomes.findV2ByClientOutcome(
      principal.userId,
      request.clientOutcomeId,
    );
    if (replay !== null) {
      if (replay.requestDigest !== digest)
        throw new OutcomeError(
          "outcome_idempotency_conflict",
          "This clientOutcomeId was already used for different outcome content",
        );
      const assessment = await this.recompute(request.knownPathId, aggregationScope, now);
      return this.receipt(
        replay,
        assessment,
        true,
        knownPath.safetyReview.status === "review_queued",
      );
    }
    const execution = await this.database.repositories.agentOutcomes.findV2ByExecution(
      principal.userId,
      request.knownPathId,
      request.clientExecutionId,
    );
    if (execution !== null)
      throw new OutcomeError(
        "outcome_execution_conflict",
        "This execution already reported an outcome for the KnownPath",
      );
    await this.assertRate(principal, now);
    let note: string | undefined;
    let sanitization: AgentOutcomeV2["sanitization"] = { status: "clean", findingCategories: [] };
    if (request.note !== undefined) {
      try {
        const sanitized = await sanitizePrivacyText(request.note);
        note = sanitized.value;
        sanitization = {
          status: sanitized.status,
          findingCategories: [...new Set(sanitized.findings.map((entry) => entry.category))],
        };
      } catch {
        throw new OutcomeError(
          "outcome_note_rejected",
          "The optional note appears to contain unsafe private material",
        );
      }
    }
    const versionBucket = this.versionBucket(request);
    const prior = await this.database.repositories.agentOutcomes.listV2ByKnownPath(
      request.knownPathId,
      aggregationScope,
    );
    const windowStart = new Date(now.getTime() - outcomePolicyV1.influenceWindowDays * DAY_MS);
    const duplicateWindow =
      request.outcome !== "not_used" &&
      prior.some(
        (entry) =>
          entry.reporter.userId === principal.userId &&
          entry.versionBucket === versionBucket &&
          entry.influence.status === "eligible" &&
          entry.receivedAt >= windowStart,
      );
    const originatorUserIds = await this.originatorUserIds(request.knownPathId);
    const influence = classifyOutcomeInfluence({
      outcome: request.outcome,
      duplicateWindow,
      isOriginator: originatorUserIds.has(principal.userId),
    });
    const outcome = agentOutcomeV2Schema.parse({
      _id: createAgentOutcomeId(),
      schemaVersion: 2,
      knownPathId: request.knownPathId,
      knownPathRevisionId: knownPath.latestRevisionId,
      clientOutcomeId: request.clientOutcomeId,
      clientExecutionId: request.clientExecutionId,
      reporter: { userId: principal.userId, apiKeyId: principal.apiKeyId },
      agentClient: request.agentClient,
      outcome: request.outcome,
      ...(request.attemptedAt === undefined ? {} : { attemptedAt: request.attemptedAt }),
      receivedAt: now,
      environment: normalizeEnvironment(request),
      versionBucket,
      ...(request.solutionVariantId === undefined
        ? {}
        : { solutionVariantId: request.solutionVariantId }),
      ...(request.searchId === undefined ? {} : { searchId: request.searchId }),
      ...(note === undefined ? {} : { note }),
      sanitization,
      requestDigest: digest,
      idempotencyKey: createVersionedKey([
        "agent-outcome-v2",
        principal.userId,
        request.clientOutcomeId,
      ]),
      executionKey: createVersionedKey([
        "agent-outcome-execution-v1",
        principal.userId,
        request.knownPathId,
        request.clientExecutionId,
      ]),
      influence,
      anomalySignals: duplicateWindow
        ? ["repeated_target_window"]
        : influence.status === "originator_non_independent"
          ? ["originator_outcome"]
          : [],
      visibility:
        aggregationScope.scope === "team"
          ? { scope: "team", workspaceId: aggregationScope.workspaceId }
          : { scope: "private", ownerUserId: principal.userId },
      aggregationScope,
      audit: { createdAt: now, updatedAt: now, createdByUserId: principal.userId },
    });
    const inserted = await this.database.repositories.agentOutcomes.createV2IfAbsent(outcome);
    const stored =
      inserted ??
      (await this.database.repositories.agentOutcomes.findV2ByClientOutcome(
        principal.userId,
        request.clientOutcomeId,
      ));
    if (stored === null) throw new Error("Outcome insert raced but no record was found");
    let queued =
      aggregationScope.scope === "public" && knownPath.safetyReview.status === "review_queued";
    if (stored.outcome === "misleading_or_unsafe")
      queued = await this.queueSafety(stored, knownPath.safetyReview.status, aggregationScope, now);
    const assessment = await this.recompute(request.knownPathId, aggregationScope, now);
    if (inserted !== null) recordOutcome(stored.outcome);
    return this.receipt(stored, assessment, inserted === null, queued);
  }

  private async originatorUserIds(knownPathId: KnownPathId): Promise<Set<UserId>> {
    const memberships =
      await this.database.repositories.canonicalMemberships.listActiveByKnownPath(knownPathId);
    const candidates = await this.database.repositories.candidateExperiences.findManyByIds(
      memberships.map((membership) => membership.candidateExperienceId),
    );
    const contributionIds = candidates.flatMap((candidate) =>
      candidate.contribution === undefined ? [] : [candidate.contribution.contributionId],
    );
    const users = new Set<UserId>();
    for (const contributionId of contributionIds) {
      const contribution =
        await this.database.repositories.agentContributions.findById(contributionId);
      if (contribution?.schemaVersion === 2) users.add(contribution.contributor.userId);
    }
    return users;
  }

  public async recompute(
    knownPathId: KnownPathId,
    aggregationScope: OutcomeAggregationScope = { scope: "public" },
    calculatedAt = new Date(),
  ): Promise<OutcomeAssessment> {
    const knownPath = await this.database.repositories.knownPaths.findById(knownPathId);
    if (knownPath === null || knownPath.latestRevisionId === undefined)
      throw new OutcomeError("outcome_target_not_accessible", "KnownPath not found");
    const all = await this.database.repositories.agentOutcomes.listV2ByKnownPath(
      knownPathId,
      aggregationScope,
    );
    const effective = all.filter((entry) => entry.influence.status === "eligible");
    const attempted = effective.filter((entry) =>
      ["solved", "partially_helped", "attempted_failed"].includes(entry.outcome),
    );
    const weighted = attempted.map((entry) => ({
      entry,
      weight: recencyWeight(entry.attemptedAt ?? entry.receivedAt, calculatedAt),
    }));
    const anyHelp = interval(weighted, (entry) => entry.outcome !== "attempted_failed");
    const fullSolve = interval(weighted, (entry) => entry.outcome === "solved");
    const confidenceScore = Math.round(
      100 * (0.65 * anyHelp.lowerBound + 0.35 * fullSolve.lowerBound),
    );
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    const squared = weighted.reduce((sum, item) => sum + item.weight ** 2, 0);
    const effectiveSampleSize = squared === 0 ? 0 : totalWeight ** 2 / squared;
    const recent = attempted.filter(
      (entry) =>
        calculatedAt.getTime() - (entry.attemptedAt ?? entry.receivedAt).getTime() <=
        outcomePolicyV1.recentWindowDays * DAY_MS,
    );
    const baseline = attempted.filter((entry) => {
      const age = calculatedAt.getTime() - (entry.attemptedAt ?? entry.receivedAt).getTime();
      return (
        age > outcomePolicyV1.recentWindowDays * DAY_MS &&
        age <= outcomePolicyV1.baselineWindowDays * DAY_MS
      );
    });
    const recentWeighted = recent.map((entry) => ({
      entry,
      weight: recencyWeight(entry.attemptedAt ?? entry.receivedAt, calculatedAt),
    }));
    const baselineWeighted = baseline.map((entry) => ({ entry, weight: 1 }));
    const recentAnyHelp = interval(recentWeighted, (entry) => entry.outcome !== "attempted_failed");
    const baselineAnyHelp = interval(
      baselineWeighted,
      (entry) => entry.outcome !== "attempted_failed",
    );
    const recentEffectiveSampleSize = effectiveSize(recentWeighted);
    const baselineEffectiveSampleSize = effectiveSize(baselineWeighted);
    const lowerBoundDrop = Math.max(0, baselineAnyHelp.lowerBound - recentAnyHelp.lowerBound);
    const recentFailures = recent.filter((entry) => entry.outcome === "attempted_failed");
    const decline =
      recentEffectiveSampleSize >= outcomePolicyV1.decline.recentEffectiveMinimum &&
      baselineEffectiveSampleSize >= outcomePolicyV1.decline.baselineEffectiveMinimum &&
      lowerBoundDrop >= outcomePolicyV1.decline.lowerBoundDrop &&
      recentFailures.length >= outcomePolicyV1.decline.failures &&
      new Set(recentFailures.map((entry) => entry.reporter.userId)).size >=
        outcomePolicyV1.decline.users;
    const safetyUsers = new Set(
      effective
        .filter(
          (entry) =>
            entry.outcome === "misleading_or_unsafe" &&
            calculatedAt.getTime() - entry.receivedAt.getTime() <= 90 * DAY_MS,
        )
        .map((entry) => entry.reporter.userId),
    ).size;
    const penalties: OutcomeAssessment["penalties"] = [
      ...(safetyUsers >= outcomePolicyV1.safetyCorroborationUsers
        ? ["corroborated_safety" as const]
        : []),
      ...(decline ? ["outcome_degradation" as const] : []),
    ];
    const inputKey = createVersionedKey([
      "outcome-assessment-v1",
      knownPathId,
      knownPath.latestRevisionId,
      stableJson(aggregationScope),
      outcomePolicyDigest,
      calculatedAt.toISOString().slice(0, 10),
      ...all.map((entry) => entry._id),
    ]);
    const existing =
      await this.database.repositories.outcomeAssessments.findByIdempotencyKey(inputKey);
    if (existing !== null) {
      if (aggregationScope.scope === "public")
        await this.database.repositories.knownPaths.updateOutcomeAssessment(
          knownPathId,
          existing._id,
          existing.calculatedAt,
        );
      return existing;
    }
    const assessment = outcomeAssessmentSchema.parse({
      _id: createOutcomeAssessmentId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      knownPathId,
      knownPathRevisionId: knownPath.latestRevisionId,
      aggregationScope,
      idempotencyKey: inputKey,
      algorithm: { identifier: "knownpath-outcome-confidence", version: 1 },
      policy: { identifier: "knownpath-outcome-policy", version: 1, digest: outcomePolicyDigest },
      calculatedAt,
      inputOutcomeIds: all.map((entry) => entry._id),
      counts: counts(all, effective, recent),
      recency: { graceDays: 30, halfLifeDays: 180, totalWeight, effectiveSampleSize },
      intervals: { anyHelp, fullSolve },
      confidence: {
        status: effectiveSampleSize === 0 ? "unobserved" : "observed",
        score: confidenceScore,
        grade: grade(confidenceScore, effectiveSampleSize === 0),
      },
      ...latestDates(effective),
      versionDistribution: versionDistribution(effective),
      trend: {
        status: decline
          ? "declining"
          : recentEffectiveSampleSize >= outcomePolicyV1.decline.recentEffectiveMinimum &&
              baselineEffectiveSampleSize >= outcomePolicyV1.decline.baselineEffectiveMinimum
            ? "stable"
            : "insufficient_data",
        recentEffectiveSampleSize,
        baselineEffectiveSampleSize,
        lowerBoundDrop,
      },
      penalties,
      reasonCodes: [
        effectiveSampleSize === 0 ? "outcomes_unobserved" : "decay_adjusted_wilson",
        ...penalties,
      ],
      explanations: [
        effectiveSampleSize === 0
          ? "No eligible attempted outcome evidence is available."
          : `Outcome confidence uses conservative Wilson lower bounds across ${effective.length} independently capped reports.`,
        ...(safetyUsers === 1
          ? ["One safety report queued review but did not affect ranking."]
          : []),
      ],
      audit: { createdAt: calculatedAt, updatedAt: calculatedAt },
    });
    const inserted = await this.database.repositories.outcomeAssessments.createIfAbsent(assessment);
    const stored =
      inserted ??
      (await this.database.repositories.outcomeAssessments.findByIdempotencyKey(inputKey));
    if (stored === null) throw new Error("Outcome assessment insert raced but was not found");
    if (aggregationScope.scope === "public")
      await this.database.repositories.knownPaths.updateOutcomeAssessment(
        knownPathId,
        stored._id,
        stored.calculatedAt,
      );
    return stored;
  }

  private async assertRate(principal: OutcomePrincipal, now: Date) {
    if (
      (await this.database.repositories.agentOutcomes.countRecentByApiKey(
        principal.apiKeyId,
        new Date(now.getTime() - 3_600_000),
      )) >= outcomePolicyV1.apiKeyPerHour
    )
      throw new OutcomeError(
        "outcome_rate_limited",
        "This API key reached the hourly outcome limit",
      );
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (
      (await this.database.repositories.agentOutcomes.countRecentByUser(principal.userId, day)) >=
      outcomePolicyV1.accountPerDay
    )
      throw new OutcomeError(
        "outcome_rate_limited",
        "This account reached the daily outcome limit",
      );
  }

  private assertAttemptTime(request: OutcomeSubmissionRequest, now: Date) {
    if (
      request.attemptedAt !== undefined &&
      (request.attemptedAt.getTime() > now.getTime() + 300_000 ||
        request.attemptedAt.getTime() < now.getTime() - 5 * 365 * DAY_MS)
    )
      throw new OutcomeError(
        "outcome_target_not_accessible",
        "attemptedAt is outside the accepted time range",
      );
  }

  private versionBucket(request: OutcomeSubmissionRequest): string {
    const versions = request.environment.versions.map(normalizeVersion).sort();
    return normalizeInlineText(versions.join("|") || "unknown").slice(0, 256);
  }

  private async queueSafety(
    outcome: AgentOutcomeV2,
    fromStatus: "clear" | "review_queued" | "under_review" | "resolved" | "restricted",
    aggregationScope: OutcomeAggregationScope,
    now: Date,
  ): Promise<boolean> {
    if (
      aggregationScope.scope === "public" &&
      ["review_queued", "under_review", "restricted"].includes(fromStatus)
    )
      return true;
    const key = createVersionedKey([
      "safety-review-outcome-v1",
      outcome._id,
      stableJson(aggregationScope),
    ]);
    let event = await this.database.repositories.safetyEvents.findByIdempotencyKey(key);
    if (event === null)
      event = await this.database.repositories.safetyEvents.createIfAbsent(
        safetyEventSchema.parse({
          _id: createSafetyEventId(),
          schemaVersion: 1,
          knownPathId: outcome.knownPathId,
          aggregationScope,
          sourceOutcomeId: outcome._id,
          idempotencyKey: key,
          eventType: "review_queued",
          fromStatus,
          toStatus: "review_queued",
          reasonCode: "single_unverified_safety_report",
          actor: { kind: "system" },
          occurredAt: now,
          audit: { createdAt: now, updatedAt: now },
        }),
      );
    if (event === null)
      event = await this.database.repositories.safetyEvents.findByIdempotencyKey(key);
    if (event === null) throw new Error("Safety event insert raced but was not found");
    if (aggregationScope.scope === "public")
      await this.database.repositories.knownPaths.queueSafetyReview(
        outcome.knownPathId,
        event._id,
        now,
      );
    return true;
  }

  private receipt(
    outcome: AgentOutcomeV2,
    assessment: OutcomeAssessment,
    reused: boolean,
    safetyReviewQueued: boolean,
  ): OutcomeSubmissionResponse {
    return outcomeSubmissionResponseSchema.parse({
      contractVersion: OUTCOME_CONTRACT_VERSION,
      outcomeId: outcome._id,
      reused,
      outcome: outcome.outcome,
      influence: outcome.influence,
      safetyReviewQueued,
      assessmentId: assessment._id,
      aggregate: {
        effectiveSampleSize: assessment.recency.effectiveSampleSize,
        confidenceScore: assessment.confidence.score,
        confidenceGrade: assessment.confidence.grade,
      },
    });
  }
}

export function classifyOutcomeInfluence(input: {
  readonly outcome: OutcomeSubmissionRequest["outcome"];
  readonly duplicateWindow: boolean;
  readonly isOriginator: boolean;
}): AgentOutcomeV2["influence"] {
  if (input.outcome === "not_used")
    return { status: "not_evidence", reasonCode: "not_used_has_zero_weight" };
  if (input.isOriginator)
    return {
      status: "originator_non_independent",
      reasonCode: "originating_account_is_not_independent_evidence",
    };
  if (input.duplicateWindow)
    return { status: "duplicate_window", reasonCode: "account_version_window_cap" };
  return { status: "eligible", reasonCode: "independent_account_window" };
}

function outcomeTargetAccess(scope: OutcomeTargetScope, userId: UserId): RetrievalAccess {
  if (scope.kind === "public") return { scope: "public" };
  if (scope.kind === "personal") return { scope: "private", ownerUserId: userId };
  return { scope: "team", workspaceId: scope.workspaceId };
}

function outcomeAggregationScope(principal: OutcomePrincipal): OutcomeAggregationScope {
  if (principal.workspaceId !== undefined)
    return { scope: "team", workspaceId: principal.workspaceId };
  if (principal.scope.kind === "personal")
    return { scope: "private", ownerUserId: principal.userId };
  return { scope: "public" };
}

function normalizeEnvironment(request: OutcomeSubmissionRequest) {
  return {
    ...(request.environment.ecosystem === undefined
      ? {}
      : { ecosystem: normalizeEcosystem(request.environment.ecosystem) }),
    packages: request.environment.packages.map((entry) => ({
      name: normalizePackageName(request.environment.ecosystem ?? "unknown", entry.name),
      ...(entry.version === undefined ? {} : { version: normalizeVersion(entry.version) }),
    })),
    platforms: request.environment.platforms.map(normalizePlatform),
    versions: request.environment.versions.map(normalizeVersion),
    ...(request.environment.runtime === undefined
      ? {}
      : { runtime: normalizeInlineText(request.environment.runtime) }),
    toolchain: request.environment.toolchain.map(normalizeInlineText),
  };
}

function recencyWeight(at: Date, now: Date): number {
  const age = Math.max(0, (now.getTime() - at.getTime()) / DAY_MS);
  return age <= 30 ? 1 : 0.5 ** ((age - 30) / 180);
}
function effectiveSize(values: readonly { weight: number }[]): number {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  const squared = values.reduce((sum, value) => sum + value.weight ** 2, 0);
  return squared === 0 ? 0 : total ** 2 / squared;
}
function interval(
  values: readonly { entry: AgentOutcomeV2; weight: number }[],
  success: (entry: AgentOutcomeV2) => boolean,
) {
  const total = values.reduce((s, v) => s + v.weight, 0);
  const squared = values.reduce((s, v) => s + v.weight ** 2, 0);
  const n = squared === 0 ? 0 : total ** 2 / squared;
  const p =
    total === 0 ? 0 : values.reduce((s, v) => s + (success(v.entry) ? v.weight : 0), 0) / total;
  if (n === 0) return { observedRate: 0, lowerBound: 0, upperBound: 1 };
  const z = 1.96;
  const denominator = 1 + z ** 2 / n;
  const center = (p + z ** 2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z ** 2 / (4 * n ** 2))) / denominator;
  return {
    observedRate: p,
    lowerBound: Math.max(0, center - margin),
    upperBound: Math.min(1, center + margin),
  };
}
function counts(
  all: readonly AgentOutcomeV2[],
  effective: readonly AgentOutcomeV2[],
  recent: readonly AgentOutcomeV2[],
) {
  const count = (state: AgentOutcomeV2["outcome"]) =>
    effective.filter((v) => v.outcome === state).length;
  return {
    total: all.length,
    eligible: all.filter((v) => v.influence.status === "eligible").length,
    effective: effective.length,
    excluded: all.length - effective.length,
    uniqueUsers: new Set(effective.map((v) => v.reporter.userId)).size,
    uniqueApiKeys: new Set(effective.map((v) => v.reporter.apiKeyId)).size,
    solved: count("solved"),
    partiallyHelped: count("partially_helped"),
    attemptedFailed: count("attempted_failed"),
    incompatibleEnvironment: count("incompatible_environment"),
    staleOrOutdated: count("stale_or_outdated"),
    misleadingOrUnsafe: count("misleading_or_unsafe"),
    notUsed: all.filter((v) => v.outcome === "not_used").length,
    recentSuccesses: recent.filter(
      (v) => v.outcome === "solved" || v.outcome === "partially_helped",
    ).length,
  };
}
function latestDates(values: readonly AgentOutcomeV2[]) {
  const max = (states: readonly AgentOutcomeV2["outcome"][]) =>
    values
      .filter((v) => states.includes(v.outcome))
      .map((v) => v.attemptedAt ?? v.receivedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];
  const success = max(["solved", "partially_helped"]);
  const failed = max(["attempted_failed"]);
  return {
    ...(success === undefined ? {} : { lastSuccessfulAt: success }),
    ...(failed === undefined ? {} : { lastFailedAt: failed }),
  };
}
function versionDistribution(values: readonly AgentOutcomeV2[]) {
  const map = new Map<string, AgentOutcomeV2[]>();
  for (const value of values)
    map.set(value.versionBucket, [...(map.get(value.versionBucket) ?? []), value]);
  return [...map]
    .map(([bucket, entries]) => ({
      bucket,
      count: entries.length,
      solved: entries.filter((v) => v.outcome === "solved").length,
      failed: entries.filter((v) => v.outcome === "attempted_failed").length,
    }))
    .sort((a, b) => b.count - a.count || a.bucket.localeCompare(b.bucket))
    .slice(0, 128);
}
function grade(score: number, unobserved: boolean): OutcomeAssessment["confidence"]["grade"] {
  if (unobserved) return "unobserved";
  if (score < 25) return "very_low";
  if (score < 50) return "low";
  if (score < 70) return "moderate";
  if (score < 85) return "high";
  return "very_high";
}
function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
