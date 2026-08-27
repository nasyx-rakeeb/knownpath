import { createHmac, timingSafeEqual } from "node:crypto";

import type { KnownPathRepositories } from "@knownpath/database";
import {
  DASHBOARD_API_CONTRACT_VERSION,
  agentContributionIdSchema,
  agentOutcomeIdSchema,
  knowledgeSearchEventIdSchema,
  userIdSchema,
  type AccountDashboardResponse,
  type ContributionHistoryQuery,
  type ContributionHistoryResponse,
  type DashboardPageQuery,
  type OutcomeHistoryQuery,
  type OutcomeHistoryResponse,
  type SearchActivityResponse,
  type UserId,
} from "@knownpath/domain";

import { AuditService } from "./audit.js";
import { AuthResourceNotFoundError } from "./errors.js";

const SUMMARY_WINDOW_DAYS = 30 as const;

type CursorKind = "contributions" | "outcomes" | "searches";

interface CursorPayload {
  readonly at: string;
  readonly filter: string;
  readonly id: string;
  readonly kind: CursorKind;
  readonly userId: string;
  readonly version: 1;
}

export class DashboardCursorError extends Error {
  public readonly code = "invalid_cursor";

  public constructor() {
    super("The dashboard pagination cursor is invalid or does not match this request");
    this.name = "DashboardCursorError";
  }
}

export class UserDashboardService {
  public constructor(
    private readonly repositories: KnownPathRepositories,
    private readonly audit: AuditService,
    private readonly cursorSecret: string,
  ) {}

  public async summary(userId: UserId): Promise<AccountDashboardResponse> {
    const now = new Date();
    const since = new Date(now.getTime() - SUMMARY_WINDOW_DAYS * 86_400_000);
    const [
      keys,
      searches,
      contributions,
      outcomes,
      recentSearches,
      recentContributions,
      recentOutcomes,
    ] = await Promise.all([
      this.repositories.apiKeys.listByUserId(userId),
      this.repositories.knowledgeSearchEvents.summarizeByUserSince(userId, since),
      this.repositories.agentContributions.summarizeV2ByOwnerSince(userId, since),
      this.repositories.agentOutcomes.summarizeV2ByOwnerSince(userId, since),
      this.repositories.knowledgeSearchEvents.listByUserId(userId, undefined, 5),
      this.repositories.agentContributions.listV2ByOwner(userId, { limit: 5 }),
      this.repositories.agentOutcomes.listV2ByOwner(userId, { limit: 5 }),
    ]);

    const activeKeys = keys.filter(
      (key) => key.status === "active" && (key.expiresAt === undefined || key.expiresAt > now),
    );
    const expiredKeys = keys.filter(
      (key) => key.status === "expired" || (key.expiresAt !== undefined && key.expiresAt <= now),
    );
    const activities = [
      ...keys
        .filter((key) => key.audit.createdAt >= since)
        .map((key) => ({
          kind: "api_key" as const,
          id: key._id,
          occurredAt: key.audit.createdAt.toISOString(),
          label: key.name,
          status: key.status,
        })),
      ...recentSearches.map((search) => ({
        kind: "search" as const,
        id: search._id,
        occurredAt: search.createdAt.toISOString(),
        label: `Knowledge search with ${search.results.length} result${search.results.length === 1 ? "" : "s"}`,
        status: search.selected === undefined ? "viewed" : "selected",
        ...(search.selected === undefined ? {} : { knownPathId: search.selected.knownPathId }),
      })),
      ...recentContributions.map((contribution) => ({
        kind: "contribution" as const,
        id: contribution._id,
        occurredAt: contribution.audit.createdAt.toISOString(),
        label: contribution.payload.problem,
        status: contribution.processing.stage,
        ...(contribution.knownPathId === undefined
          ? {}
          : { knownPathId: contribution.knownPathId }),
      })),
      ...recentOutcomes.map((outcome) => ({
        kind: "outcome" as const,
        id: outcome._id,
        occurredAt: outcome.receivedAt.toISOString(),
        label: `Outcome reported as ${outcome.outcome.replaceAll("_", " ")}`,
        status: outcome.influence.status,
        knownPathId: outcome.knownPathId,
      })),
    ]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 12);

    return {
      contractVersion: DASHBOARD_API_CONTRACT_VERSION,
      generatedAt: now.toISOString(),
      windowDays: SUMMARY_WINDOW_DAYS,
      apiKeys: {
        active: activeKeys.length,
        revoked: keys.filter((key) => key.status === "revoked").length,
        expired: expiredKeys.length,
        ...latestDate(
          keys.flatMap((key) => (key.lastUsedAt === undefined ? [] : [key.lastUsedAt])),
        ),
      },
      searches,
      contributions,
      outcomes,
      recentActivity: activities,
    };
  }

  public async searchActivity(
    userId: UserId,
    query: DashboardPageQuery,
  ): Promise<SearchActivityResponse> {
    const filter = "all";
    const cursor =
      query.cursor === undefined
        ? undefined
        : this.decodeCursor(query.cursor, "searches", userId, filter, knowledgeSearchEventIdSchema);
    const records = await this.repositories.knowledgeSearchEvents.listByUserId(
      userId,
      cursor === undefined ? undefined : { createdAt: cursor.at, id: cursor.id },
      query.limit + 1,
    );
    const page = records.slice(0, query.limit);
    return {
      contractVersion: DASHBOARD_API_CONTRACT_VERSION,
      items: page.map((record) => ({
        searchId: record._id,
        createdAt: record.createdAt.toISOString(),
        ...(record.querySummary.ecosystem === undefined
          ? {}
          : { ecosystem: record.querySummary.ecosystem }),
        packageCount: record.querySummary.packageCount,
        versionCount: record.querySummary.versionCount,
        platformCount: record.querySummary.platformCount,
        errorCount: record.querySummary.errorCount,
        semanticMode: record.querySummary.semanticMode,
        resultCount: record.results.length,
        ...(record.selected === undefined
          ? {}
          : {
              selected: {
                knownPathId: record.selected.knownPathId,
                rank: record.selected.rank,
                recordedAt: record.selected.recordedAt.toISOString(),
              },
            }),
      })),
      nextCursor:
        records.length <= query.limit || page.length === 0
          ? null
          : this.encodeCursor({
              at: page.at(-1)!.createdAt,
              filter,
              id: page.at(-1)!._id,
              kind: "searches",
              userId,
            }),
    };
  }

  public async contributions(
    userId: UserId,
    query: ContributionHistoryQuery,
  ): Promise<ContributionHistoryResponse> {
    const filter = `${query.status ?? "*"}:${query.visibility ?? "*"}`;
    const cursor =
      query.cursor === undefined
        ? undefined
        : this.decodeCursor(
            query.cursor,
            "contributions",
            userId,
            filter,
            agentContributionIdSchema,
          );
    const records = await this.repositories.agentContributions.listV2ByOwner(userId, {
      limit: query.limit + 1,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.visibility === undefined ? {} : { visibility: query.visibility }),
      ...(cursor === undefined ? {} : { before: { createdAt: cursor.at, id: cursor.id } }),
    });
    const page = records.slice(0, query.limit);
    return {
      contractVersion: DASHBOARD_API_CONTRACT_VERSION,
      items: page.map((record) => ({
        contributionId: record._id,
        ...(record.knownPathId === undefined ? {} : { knownPathId: record.knownPathId }),
        ...(record.processing.candidateExperienceId === undefined
          ? {}
          : { candidateExperienceId: record.processing.candidateExperienceId }),
        ...(record.processing.assessmentId === undefined
          ? {}
          : { assessmentId: record.processing.assessmentId }),
        kind: record.kind,
        problem: record.payload.problem,
        solutionSummary: record.payload.solutionSummary,
        visibility: record.visibility.scope,
        consentIntent: record.consent.intent,
        consentConfirmedAt: record.consent.confirmedAt.toISOString(),
        sanitization: {
          status: record.sanitization.status,
          findingCount: record.sanitization.findings.reduce(
            (sum, finding) => sum + finding.count,
            0,
          ),
        },
        trustState: record.trustState,
        status: record.status,
        processingStage: record.processing.stage,
        ...(record.processing.failureCode === undefined
          ? {}
          : { failureCode: record.processing.failureCode }),
        createdAt: record.audit.createdAt.toISOString(),
        updatedAt: record.audit.updatedAt.toISOString(),
      })),
      nextCursor:
        records.length <= query.limit || page.length === 0
          ? null
          : this.encodeCursor({
              at: page.at(-1)!.audit.createdAt,
              filter,
              id: page.at(-1)!._id,
              kind: "contributions",
              userId,
            }),
    };
  }

  public async outcomes(
    userId: UserId,
    query: OutcomeHistoryQuery,
  ): Promise<OutcomeHistoryResponse> {
    const filter = query.outcome ?? "*";
    const cursor =
      query.cursor === undefined
        ? undefined
        : this.decodeCursor(query.cursor, "outcomes", userId, filter, agentOutcomeIdSchema);
    const records = await this.repositories.agentOutcomes.listV2ByOwner(userId, {
      limit: query.limit + 1,
      ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
      ...(cursor === undefined ? {} : { before: { receivedAt: cursor.at, id: cursor.id } }),
    });
    const page = records.slice(0, query.limit);
    const [paths, safetyEvents] = await Promise.all([
      this.repositories.knownPaths.findManyByIds([
        ...new Set(page.map((record) => record.knownPathId)),
      ]),
      this.repositories.safetyEvents.listBySourceOutcomeIds(page.map((record) => record._id)),
    ]);
    const titleById = new Map(
      paths
        .filter((path) => path.status === "published" && path.visibility.scope === "public")
        .map((path) => [path._id, path.title] as const),
    );
    const safetyOutcomeIds = new Set(
      safetyEvents.flatMap((event) =>
        event.sourceOutcomeId === undefined ? [] : [event.sourceOutcomeId],
      ),
    );
    return {
      contractVersion: DASHBOARD_API_CONTRACT_VERSION,
      items: page.map((record) => ({
        outcomeId: record._id,
        knownPathId: record.knownPathId,
        ...(titleById.get(record.knownPathId) === undefined
          ? {}
          : { knownPathTitle: titleById.get(record.knownPathId)! }),
        outcome: record.outcome,
        ...(record.attemptedAt === undefined
          ? {}
          : { attemptedAt: record.attemptedAt.toISOString() }),
        receivedAt: record.receivedAt.toISOString(),
        environment: record.environment,
        ...(record.note === undefined ? {} : { note: record.note }),
        influence: record.influence.status,
        safetyReviewQueued: safetyOutcomeIds.has(record._id),
      })),
      nextCursor:
        records.length <= query.limit || page.length === 0
          ? null
          : this.encodeCursor({
              at: page.at(-1)!.receivedAt,
              filter,
              id: page.at(-1)!._id,
              kind: "outcomes",
              userId,
            }),
    };
  }

  public async updateProfile(
    userId: UserId,
    displayName: string,
    context: { readonly ipAddress?: string; readonly requestId?: string },
  ): Promise<{ readonly displayName: string; readonly updatedAt: string }> {
    const user = await this.repositories.users.updateDisplayName(userId, displayName);
    if (user === null) throw new Error("Dashboard profile owner disappeared");
    await this.audit.record({
      actor: { kind: "user", userId },
      eventType: "user.profile_updated",
      target: { kind: "user", id: userId },
      outcome: "success",
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
    });
    return { displayName: user.displayName, updatedAt: user.updatedAt.toISOString() };
  }

  public async sessions(userId: UserId, currentSessionId: string) {
    const sessions = await this.repositories.authSessions.listActiveByUserId(userId, new Date());
    return sessions.map((session) => ({
      id: session._id,
      current: session._id === currentSessionId,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      ...(session.userAgent === undefined ? {} : { userAgent: session.userAgent.slice(0, 1_000) }),
    }));
  }

  public async revokeSession(
    userId: UserId,
    currentSessionId: string,
    targetSessionId: string,
    context: { readonly ipAddress?: string; readonly requestId?: string },
  ) {
    const revoked = await this.repositories.authSessions.revokeOwned(targetSessionId, userId);
    if (!revoked) throw new AuthResourceNotFoundError("The active session was not found");
    await this.audit.record({
      actor: { kind: "user", userId },
      eventType: "session.revoked",
      target: { kind: "session", id: targetSessionId },
      outcome: "success",
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
    });
    return {
      revokedSessionId: targetSessionId,
      revokedCurrentSession: targetSessionId === currentSessionId,
    };
  }

  private encodeCursor(input: {
    readonly at: Date;
    readonly filter: string;
    readonly id: string;
    readonly kind: CursorKind;
    readonly userId: UserId;
  }): string {
    const payload: CursorPayload = {
      at: input.at.toISOString(),
      filter: input.filter,
      id: input.id,
      kind: input.kind,
      userId: input.userId,
      version: 1,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${this.sign(encoded)}`;
  }

  private decodeCursor<Id extends string>(
    cursor: string,
    kind: CursorKind,
    userId: UserId,
    filter: string,
    idSchema: { parse(input: unknown): Id },
  ): { readonly at: Date; readonly id: Id } {
    const [encoded, suppliedSignature, extra] = cursor.split(".");
    if (encoded === undefined || suppliedSignature === undefined || extra !== undefined)
      throw new DashboardCursorError();
    const expectedSignature = this.sign(encoded);
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new DashboardCursorError();
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
      if (!isCursorPayload(payload)) throw new DashboardCursorError();
      if (
        payload.version !== 1 ||
        payload.kind !== kind ||
        userIdSchema.parse(payload.userId) !== userId ||
        payload.filter !== filter
      )
        throw new DashboardCursorError();
      const at = new Date(payload.at);
      if (Number.isNaN(at.getTime())) throw new DashboardCursorError();
      return { at, id: idSchema.parse(payload.id) };
    } catch (error) {
      if (error instanceof DashboardCursorError) throw error;
      throw new DashboardCursorError();
    }
  }

  private sign(value: string): string {
    return createHmac("sha256", this.cursorSecret).update(value).digest("base64url");
  }
}

function latestDate(values: readonly Date[]): { readonly lastUsedAt?: string } {
  if (values.length === 0) return {};
  return {
    lastUsedAt: new Date(Math.max(...values.map((value) => value.getTime()))).toISOString(),
  };
}

function isCursorPayload(value: unknown): value is CursorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "at" in value &&
    typeof value.at === "string" &&
    "filter" in value &&
    typeof value.filter === "string" &&
    "id" in value &&
    typeof value.id === "string" &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "userId" in value &&
    typeof value.userId === "string" &&
    "version" in value &&
    value.version === 1
  );
}
