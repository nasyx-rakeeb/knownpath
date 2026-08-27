import type { KnownPathDatabase } from "@knownpath/database";
import {
  CURRENT_SCHEMA_VERSION,
  WORKSPACE_API_CONTRACT_VERSION,
  createKnowledgeShareRequestId,
  knowledgeShareRequestSchema,
  publicKnowledgeShareResponseSchema,
  publicKnowledgeShareSubmissionSchema,
  type KnownPathId,
  type User,
  type AuditEventType,
  type AuditTarget,
} from "@knownpath/domain";

import { ContributionError } from "./errors.js";
import { sanitizeContributionPayload } from "./sanitizer.js";
import type { ContributionService } from "./service.js";

export interface PublicShareContext {
  readonly requestId?: string;
  readonly ipAddress?: string;
}

interface AuditRecorder {
  record(input: {
    actor: { kind: "user"; userId: User["_id"] };
    eventType: AuditEventType;
    target: AuditTarget;
    outcome: "success";
    requestId?: string;
    ipAddress?: string;
    metadata?: Record<string, string>;
  }): Promise<unknown>;
}

export class PublicKnowledgeShareService {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly contributions: ContributionService,
    private readonly audit: AuditRecorder,
  ) {}

  public async submit(
    sourceKnownPathId: KnownPathId,
    input: unknown,
    user: User,
    context: PublicShareContext,
    processingMode: "inline" | "deferred" = "inline",
  ) {
    const request = publicKnowledgeShareSubmissionSchema.parse(input);
    const source = await this.database.repositories.knownPaths.findById(sourceKnownPathId);
    if (source === null || source.visibility.scope === "public")
      throw new ContributionError(
        "contribution_not_found",
        "The private or workspace KnownPath was not found",
      );
    const authorized =
      source.visibility.scope === "private"
        ? source.visibility.ownerUserId === user._id
        : (await this.database.repositories.workspaceMemberships.findActive(
            source.visibility.workspaceId,
            user._id,
          )) !== null &&
          (await this.database.repositories.workspaces.findById(source.visibility.workspaceId))
            ?.status === "active";
    if (!authorized)
      throw new ContributionError(
        "contribution_not_found",
        "The private or workspace KnownPath was not found",
      );
    if (user.contributionMode === "disabled")
      throw new ContributionError(
        "contribution_disabled",
        "Contributions are disabled for this account",
      );
    const sanitized = await sanitizeContributionPayload(request.payload);
    const now = new Date();
    const share = knowledgeShareRequestSchema.parse({
      _id: createKnowledgeShareRequestId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sourceKnownPathId,
      sourceScope: source.visibility,
      requestedByUserId: user._id,
      status: "draft",
      publicPayload: sanitized.payload,
      sanitization: sanitized.report,
      consent: {
        policyVersion: request.consent.policyVersion,
        confirmedAt: now,
        confirmedByUserId: user._id,
      },
      audit: {
        createdAt: now,
        updatedAt: now,
        createdByUserId: user._id,
        updatedByUserId: user._id,
      },
    });
    const created = await this.database.repositories.knowledgeShareRequests.createIfAbsent(share);
    if (created === null) throw new Error("Public share request could not be stored");
    if (sanitized.report.status === "quarantined") {
      await this.database.repositories.knowledgeShareRequests.complete(created._id, "quarantined");
      await this.record("knowledge.public_share_quarantined", created._id, user, context);
      return publicKnowledgeShareResponseSchema.parse({
        contractVersion: WORKSPACE_API_CONTRACT_VERSION,
        shareRequestId: created._id,
        sourceKnownPathId,
        status: "quarantined",
        sanitization: {
          status: sanitized.report.status,
          findingCount: findingCount(sanitized.report.findings),
        },
      });
    }
    const result = await this.contributions.submit(
      {
        contractVersion: 1,
        clientSubmissionId: created._id,
        kind: "new_lesson",
        visibility: "public",
        consent: { policyVersion: 1, confirmed: true },
        agentClient: { name: "knownpath-dashboard" },
        payload: sanitized.payload,
      },
      { user, channel: "dashboard_share" },
      new AbortController().signal,
      processingMode,
    );
    const completed = await this.database.repositories.knowledgeShareRequests.complete(
      created._id,
      "submitted",
      result.contribution._id,
    );
    if (completed === null) throw new Error("Public share request completion raced");
    await this.record("knowledge.public_share_submitted", created._id, user, context, {
      publicContributionId: result.contribution._id,
    });
    return publicKnowledgeShareResponseSchema.parse({
      contractVersion: WORKSPACE_API_CONTRACT_VERSION,
      shareRequestId: created._id,
      sourceKnownPathId,
      status: "submitted",
      publicContributionId: result.contribution._id,
      sanitization: {
        status: sanitized.report.status,
        findingCount: findingCount(sanitized.report.findings),
      },
    });
  }

  private async record(
    eventType: AuditEventType,
    id: string,
    user: User,
    context: PublicShareContext,
    metadata?: Record<string, string>,
  ) {
    await this.audit.record({
      actor: { kind: "user", userId: user._id },
      eventType,
      target: { kind: "knowledge_share_request", id },
      outcome: "success",
      ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
      ...(metadata === undefined ? {} : { metadata }),
    });
  }
}

function findingCount(findings: readonly { count: number }[]): number {
  return findings.reduce((sum, finding) => sum + finding.count, 0);
}
