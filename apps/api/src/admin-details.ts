import type { KnownPathDatabase } from "@knownpath/database";
import {
  agentContributionIdSchema,
  agentOutcomeIdSchema,
  auditEventIdSchema,
  candidateExperienceIdSchema,
  extractionAttemptIdSchema,
  knownPathIdSchema,
  pipelineRunIdSchema,
  sourceItemIdSchema,
  sourceRegistryIdSchema,
  userIdSchema,
  type AdminResource,
} from "@knownpath/domain";

export async function loadAdminDetail(
  database: KnownPathDatabase,
  resource: AdminResource,
  id: string,
): Promise<unknown> {
  if (resource === "sources") {
    const value = await database.repositories.sourceRegistries.findById(
      sourceRegistryIdSchema.parse(id),
    );
    return value === null
      ? null
      : {
          contractVersion: 1,
          resource,
          id,
          title: value.name,
          status: value.enabled ? "enabled" : "disabled",
          visibility: value.visibility.scope,
          sections: [
            {
              title: "Source",
              fields: fields({
                kind: value.kind,
                canonicalUrl: value.canonicalUrl,
                lastAttempt: iso(value.lastIngestionAttemptAt),
                lastSuccess: iso(value.lastSuccessfulIngestionAt),
                ecosystem: value.ecosystemHints.join(", "),
              }),
            },
          ],
          references: [{ label: "Canonical source", url: value.canonicalUrl }],
          privateContentAvailable: false,
        };
  }
  if (resource === "source-items") {
    const value = await database.repositories.sourceItems.findById(sourceItemIdSchema.parse(id));
    return value === null
      ? null
      : {
          contractVersion: 1,
          resource,
          id,
          title: value.title ?? value.provenance.sourceItemIdentity,
          status: value.itemType,
          visibility: value.visibility.scope,
          sections: [
            {
              title: "Provenance",
              fields: fields({
                sourceRegistryId: value.sourceRegistryId,
                capturedAt: value.capturedAt.toISOString(),
                digest: value.content.digest,
                authority: value.sourceQuality?.authority ?? "unknown",
                contentTruncated: (value.content.text?.length ?? 0) > 200_000,
              }),
            },
            {
              title: "Normalized untrusted content",
              fields: [],
              ...(value.content.text === undefined
                ? {}
                : { text: value.content.text.slice(0, 200_000) }),
            },
          ],
          references: [{ label: "Source", url: value.provenance.canonicalUrl }],
          privateContentAvailable: false,
        };
  }
  if (resource === "jobs") {
    const value = await database.repositories.pipelineRuns.findById(pipelineRunIdSchema.parse(id));
    if (value === null) return null;
    const steps = await database.repositories.pipelineSteps.listByRun(value._id);
    return {
      contractVersion: 1,
      resource,
      id,
      title: `${value.kind} run`,
      status: value.status,
      sections: [
        {
          title: "Run",
          fields: fields({
            trigger: value.trigger,
            target: `${value.scope.target.kind}:${value.scope.target.id}`,
            createdAt: value.audit.createdAt.toISOString(),
            lastError: value.lastError?.message ?? "none",
          }),
        },
        {
          title: "Steps",
          fields: steps.map((step) => ({
            label: step.jobName,
            value: `${step.status} · ${step._id}`,
            tone:
              step.status === "failed" || step.status === "quarantined" ? "critical" : "neutral",
          })),
        },
      ],
      references: [],
      privateContentAvailable: false,
    };
  }
  if (resource === "extractions") {
    const value = await database.repositories.extractionAttempts.findById(
      extractionAttemptIdSchema.parse(id),
    );
    return value === null
      ? null
      : {
          contractVersion: 1,
          resource,
          id,
          title: `${value.strategy} extraction`,
          status: value.status,
          sections: [
            {
              title: "Provider",
              fields: fields({
                provider: value.provider,
                model: value.model,
                capability: value.providerCapability,
                latencyMs: value.latencyMs ?? "unknown",
                tokens: value.usage?.totalTokens ?? "unknown",
              }),
            },
            {
              title: "Validation",
              fields: value.validationIssues.map((issue) => ({
                label: issue.code,
                value: issue.message,
                tone: "warning",
              })),
            },
          ],
          references: [],
          privateContentAvailable: false,
        };
  }
  if (resource === "candidates") {
    const value = await database.repositories.candidateExperiences.findById(
      candidateExperienceIdSchema.parse(id),
    );
    if (value === null) return null;
    const assessments = await database.repositories.candidateAssessments.listByCandidate(value._id);
    if (value.visibility.scope !== "public")
      return {
        contractVersion: 1,
        resource,
        id,
        title: `Private candidate ${value._id.slice(0, 8)}`,
        status: `${value.status}/${value.moderation.status}`,
        visibility: value.visibility.scope,
        sections: [
          {
            title: "Private projection metadata",
            fields: fields({
              contributionId: value.contribution?.contributionId ?? "none",
              assessmentCount: assessments.length,
              latestAssessmentId: value.latestAssessmentId ?? "none",
            }),
          },
        ],
        references: [],
        privateContentAvailable: false,
      };
    return {
      contractVersion: 1,
      resource,
      id,
      title: value.problemSummary.slice(0, 1_000),
      status: `${value.status}/${value.moderation.status}`,
      visibility: value.visibility.scope,
      sections: [
        {
          title: "Solution",
          fields: fields({
            solution: value.solutionSummary,
            ecosystem: value.metadata.primaryEcosystem,
            packages: value.metadata.packages.map((item) => item.name).join(", "),
            caveats: value.caveats.join("; "),
          }),
        },
        {
          title: "Assessments",
          fields: assessments
            .flatMap((assessment) => [
              {
                label: `Score v${assessment.algorithm.version}`,
                value: `${assessment.finalScore.score}/100 · ${assessment.finalScore.grade}`,
                tone:
                  assessment.finalScore.score >= 70
                    ? "positive"
                    : assessment.finalScore.score < 40
                      ? "warning"
                      : "neutral",
              },
              ...assessment.explanations.map((explanation, index) => ({
                label: assessment.reasonCodes[index] ?? "explanation",
                value: explanation,
                tone: "neutral" as const,
              })),
            ])
            .slice(0, 256),
        },
      ],
      references: value.evidence
        .flatMap((entry) =>
          entry.canonicalUrl === undefined
            ? []
            : [{ label: entry.relationship, url: entry.canonicalUrl }],
        )
        .slice(0, 256),
      privateContentAvailable: false,
    };
  }
  if (resource === "known-paths") {
    const value = await database.repositories.knownPaths.findById(knownPathIdSchema.parse(id));
    if (value === null) return null;
    const [memberships, outcomeAssessments, safety] = await Promise.all([
      database.repositories.canonicalMemberships.listActiveByKnownPath(value._id),
      database.repositories.outcomeAssessments.listByKnownPath(value._id),
      database.repositories.safetyEvents.listByKnownPath(value._id),
    ]);
    if (value.visibility.scope !== "public")
      return {
        contractVersion: 1,
        resource,
        id,
        title: `Private KnownPath ${value._id.slice(0, 8)}`,
        status: value.status,
        visibility: value.visibility.scope,
        sections: [
          {
            title: "Private record metadata",
            fields: fields({
              trust: value.trust.score,
              scoreVersion: value.trust.scoreVersion,
              safety: value.safetyReview.status,
              memberships: memberships.length,
              outcomes: outcomeAssessments.length,
              safetyEvents: safety.length,
            }),
          },
        ],
        references: [],
        privateContentAvailable: false,
      };
    return {
      contractVersion: 1,
      resource,
      id,
      title: value.title,
      status: value.status,
      visibility: value.visibility.scope,
      sections: [
        {
          title: "Knowledge",
          fields: fields({
            problem: value.problemSummary,
            solution: value.solutionSummary,
            ecosystem: value.metadata.primaryEcosystem,
            freshness: iso(value.freshness.lastVerifiedAt),
            safety: value.safetyReview.status,
          }),
        },
        {
          title: `Trust score ${value.trust.score}/100`,
          fields: fields({
            grade: value.trust.grade,
            scoreVersion: value.trust.scoreVersion,
            assessments: value.trust.assessmentIds.length,
            outcomes: outcomeAssessments.length,
            memberships: memberships.length,
            safetyEvents: safety.length,
          }),
        },
        {
          title: "Confidence components",
          fields: Object.entries(value.confidence.components).map(([label, score]) => ({
            label,
            value: String(score),
            tone: "neutral",
          })),
        },
      ],
      references: value.evidence
        .flatMap((entry) =>
          entry.canonicalUrl === undefined
            ? []
            : [{ label: entry.relationship, url: entry.canonicalUrl }],
        )
        .slice(0, 256),
      privateContentAvailable: false,
    };
  }
  if (resource === "contributions") {
    const value = await database.repositories.agentContributions.findById(
      agentContributionIdSchema.parse(id),
    );
    if (value === null) return null;
    const isV2 = value.schemaVersion === 2;
    const isPrivate = value.visibility.scope !== "public";
    const quality = isV2
      ? await database.repositories.contributionQualityAssessments.findLatestByContribution(
          value._id,
        )
      : null;
    const candidate =
      isV2 && value.processing.candidateExperienceId !== undefined
        ? await database.repositories.candidateExperiences.findById(
            value.processing.candidateExperienceId,
          )
        : null;
    const assessment =
      candidate?.latestAssessmentId === undefined
        ? null
        : await database.repositories.candidateAssessments.findById(candidate.latestAssessmentId);
    const pairs =
      candidate === null
        ? []
        : await database.repositories.candidatePairAssessments.listByCandidate(candidate._id, 8);
    return {
      contractVersion: 1,
      resource,
      id,
      title: (isPrivate
        ? `Private contribution ${value._id.slice(0, 8)}`
        : isV2
          ? value.payload.problem
          : value.summary
      ).slice(0, 1_000),
      status: `${value.status}/${value.moderation.status}`,
      visibility: value.visibility.scope,
      sections: [
        {
          title: "Moderation",
          fields: fields({
            trust: isV2 ? value.trustState : "legacy",
            sanitization: isV2 ? value.sanitization.status : "legacy",
            processing: isV2 ? value.processing.stage : "legacy",
            relationship: isV2 ? value.relationship : "legacy",
            duplicateSearch: isV2 ? value.duplicateCheck.status : "unknown",
            qualityDecision: quality?.decision ?? "not assessed",
            qualityReasons: quality?.reasonCodes.join(", ") ?? "not assessed",
            initialTrustScore: assessment?.finalScore.score ?? "not assessed",
            similarCandidates: pairs.length,
            canonicalKnownPathId: isV2
              ? (value.processing.canonicalKnownPathId ?? "not canonicalized")
              : "unknown",
            findings: isV2
              ? [...new Set(value.sanitization.findings.map((item) => item.category))].join(", ")
              : "unknown",
          }),
        },
        ...(!isV2 || isPrivate
          ? []
          : [
              {
                title: "Sanitized public lesson",
                fields: fields({
                  problem: value.payload.problem,
                  solution: value.payload.solutionSummary,
                  rootCause: value.payload.rootCause ?? "unknown",
                  ecosystem: value.payload.ecosystem,
                  packages: value.payload.packages.map((item) => item.name).join(", "),
                  versions: value.payload.versions.join(", "),
                  platforms: value.payload.platforms.join(", "),
                  applicability: value.payload.applicability?.appliesWhen ?? "not stated",
                  verificationType: value.payload.verificationType,
                  verification: value.payload.successEvidence.summary,
                  caveats: value.payload.caveats.join(" | "),
                }),
              },
              {
                title: "Similarity and routing",
                fields: fields({
                  relationship: value.relationship,
                  targetKnownPathId: value.knownPathId ?? "none",
                  duplicateSearchId: value.duplicateCheck.searchId ?? "unavailable",
                  closestDecisions:
                    pairs
                      .map((pair) => `${pair.decision}:${pair.candidateIds.join("/")}`)
                      .join(" | ") || "none",
                }),
              },
            ]),
      ],
      references: [],
      privateContentAvailable: isV2 && isPrivate,
    };
  }
  if (resource === "outcomes") {
    const value = await database.repositories.agentOutcomes.findById(
      agentOutcomeIdSchema.parse(id),
    );
    if (value === null) return null;
    const safety = await database.repositories.safetyEvents.listBySourceOutcomeIds([value._id]);
    return {
      contractVersion: 1,
      resource,
      id,
      title: `Outcome for ${value.knownPathId}`,
      status: value.outcome,
      sections: [
        {
          title: "Aggregate-safe report",
          fields: fields({
            knownPathId: value.knownPathId,
            receivedAt:
              "receivedAt" in value
                ? value.receivedAt.toISOString()
                : value.audit.createdAt.toISOString(),
            notePresent: "note" in value ? value.note !== undefined : false,
            influence:
              value.schemaVersion === 2
                ? `${value.influence.status}:${value.influence.reasonCode}`
                : "legacy",
            anomalySignals:
              value.schemaVersion === 2 ? value.anomalySignals.join(", ") || "none" : "legacy",
            sanitization: value.schemaVersion === 2 ? value.sanitization.status : "legacy",
            safetyEvents:
              safety.map((event) => `${event.eventType}:${event.reasonCode}`).join(", ") || "none",
          }),
        },
      ],
      references: [],
      privateContentAvailable: false,
    };
  }
  if (resource === "users") {
    const value = await database.repositories.users.findById(userIdSchema.parse(id));
    if (value === null) return null;
    const keys = await database.repositories.apiKeys.listByUserId(value._id);
    return {
      contractVersion: 1,
      resource,
      id,
      title: value.displayName,
      status: value.status,
      sections: [
        {
          title: "Account",
          fields: fields({
            email: value.email,
            role: value.role,
            createdAt: value.createdAt.toISOString(),
            contributionMode: value.contributionMode,
          }),
        },
        {
          title: "API key metadata",
          fields: keys.map((key) => ({
            label: key.name,
            value: `${key.prefix} · ${key.status} · ${key.scopes.join(", ")}`,
            tone: key.status === "active" ? "positive" : "neutral",
          })),
        },
      ],
      references: [],
      privateContentAvailable: false,
    };
  }
  const value = await database.repositories.auditEvents.findById(auditEventIdSchema.parse(id));
  return value === null
    ? null
    : {
        contractVersion: 1,
        resource,
        id,
        title: value.eventType,
        status: value.outcome,
        sections: [
          {
            title: "Audit event",
            fields: fields({
              occurredAt: value.occurredAt.toISOString(),
              actor: value.actor.kind,
              target: `${value.target.kind}:${value.target.id}`,
              requestId: value.requestId ?? "none",
              metadata: JSON.stringify(value.metadata ?? {}),
            }),
          },
        ],
        references: [],
        privateContentAvailable: false,
      };
}

function fields(values: Record<string, unknown>) {
  return Object.entries(values).map(([label, value]) => ({
    label,
    value:
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : value === null || value === undefined
          ? "none"
          : JSON.stringify(value),
    tone: "neutral" as const,
  }));
}

function iso(value: Date | undefined) {
  return value?.toISOString() ?? "never";
}
