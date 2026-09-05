import type { KnownPathDatabase } from "@knownpath/database";
import {
  candidateExperienceIdSchema,
  knownPathIdSchema,
  sourceItemIdSchema,
  type CandidateExperienceId,
  type KnownPathId,
  type PipelineJobName,
  type SourceItemId,
} from "@knownpath/domain";
import {
  JobProducer,
  PermanentJobError,
  type OperationalJobData,
  type OperationalJobHandler,
} from "@knownpath/jobs";
import { contributionCanonicalizationJobKey } from "@knownpath/contributions";

export interface PipelineServices {
  readonly syncGitHub: (
    target: string,
    options: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ) => Promise<readonly SourceItemId[]>;
  readonly syncOfficial: (
    target: string,
    options: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ) => Promise<readonly SourceItemId[]>;
  readonly extract: (
    sourceItemId: SourceItemId,
    options: Readonly<Record<string, unknown>>,
  ) => Promise<CandidateExperienceId | undefined>;
  readonly score: (candidateId: CandidateExperienceId) => Promise<void>;
  readonly canonicalize: (candidateId: CandidateExperienceId) => Promise<readonly KnownPathId[]>;
  readonly project: (knownPathId: KnownPathId, useEmbedding: boolean) => Promise<void>;
  readonly processContribution: (
    contributionId: string,
  ) => Promise<CandidateExperienceId | undefined>;
  readonly aggregateOutcome: (knownPathId: KnownPathId) => Promise<void>;
  readonly rescoreFreshness: () => Promise<readonly KnownPathId[]>;
  readonly reembed: (knownPathId: KnownPathId) => Promise<void>;
}

export function createPipelineHandlers(
  database: KnownPathDatabase,
  producer: JobProducer,
  services: PipelineServices,
): Readonly<Record<PipelineJobName, OperationalJobHandler>> {
  const chain = async (
    parent: OperationalJobData,
    jobName: string,
    target: OperationalJobData["target"],
    options: Readonly<Record<string, unknown>> = {},
  ) =>
    producer.enqueue({
      jobName,
      kind:
        parent.jobName === "contribution.process"
          ? "contribution"
          : parent.jobName === "outcomes.aggregate"
            ? "outcome"
            : "reprocess",
      target,
      trigger: "chained",
      options,
      pipelineRunId: parent.pipelineRunId,
      chainDepth: parent.chainDepth + 1,
      idempotencyParts: [parent.pipelineRunId, jobName, target.kind, target.id],
    });

  return {
    "control.sources.discover": async () => ({ discovered: true }),
    "source.github.sync": async (data, signal) => {
      const ids = await services.syncGitHub(data.target.id, data.options, signal);
      for (const id of ids) await chain(data, "source.extract", { kind: "source_item", id });
      return { sourceItems: ids.length };
    },
    "source.official.sync": async (data, signal) => {
      const ids = await services.syncOfficial(data.target.id, data.options, signal);
      for (const id of ids) await chain(data, "source.extract", { kind: "source_item", id });
      return { sourceItems: ids.length };
    },
    "source.extract": async (data) => {
      const candidateId = await services.extract(
        sourceItemIdSchema.parse(data.target.id),
        data.options,
      );
      if (candidateId !== undefined)
        await chain(data, "candidate.score", { kind: "candidate", id: candidateId });
      return { candidateId };
    },
    "candidate.score": async (data) => {
      const candidateId = candidateExperienceIdSchema.parse(data.target.id);
      await services.score(candidateId);
      await chain(data, "candidate.canonicalize", { kind: "candidate", id: candidateId });
    },
    "candidate.canonicalize": async (data) => {
      const candidateId = candidateExperienceIdSchema.parse(data.target.id);
      const contribution = await contributionForCandidate(database, candidateId);
      if (contribution !== null)
        await database.repositories.agentContributions.updateProcessing(contribution._id, {
          ...contribution.processing,
          stage: "canonicalizing",
        });
      try {
        const knownPathIds = await services.canonicalize(candidateId);
        if (contribution !== null && knownPathIds[0] !== undefined)
          await database.repositories.agentContributions.updateProcessing(contribution._id, {
            ...contribution.processing,
            stage: "canonicalized",
            canonicalKnownPathId: knownPathIds[0],
            completedAt: new Date(),
          });
        for (const id of knownPathIds)
          await chain(data, "knownpath.project", { kind: "knownpath", id });
        return { knownPathIds };
      } catch (error) {
        if (contribution !== null)
          await database.repositories.agentContributions.updateProcessing(contribution._id, {
            ...contribution.processing,
            stage: "failed",
            failureCode: "canonicalization_failed",
            failureMessage: "Approved contribution canonicalization failed and is retryable",
          });
        throw error;
      }
    },
    "knownpath.project": async (data) =>
      services.project(knownPathIdSchema.parse(data.target.id), false),
    "knownpath.reembed": async (data) => services.reembed(knownPathIdSchema.parse(data.target.id)),
    "knowledge.freshness.rescore": async (data) => {
      const ids = await services.rescoreFreshness();
      for (const id of ids) await chain(data, "knownpath.project", { kind: "knownpath", id });
      return { knownPathIds: ids };
    },
    "contribution.process": async (data) => {
      const candidateId = await services.processContribution(data.target.id);
      return { candidateId };
    },
    "outcomes.aggregate": async (data) => {
      const knownPathId = knownPathIdSchema.parse(data.target.id);
      await services.aggregateOutcome(knownPathId);
      await chain(data, "knownpath.project", { kind: "knownpath", id: knownPathId });
    },
    "maintenance.reconcile": async () => reconcilePending(database, producer),
    "maintenance.retry-stale": async () => ({ recoveredBy: "bullmq-stalled-checker" }),
    "development.hold": async (data, signal) =>
      hold(Number(data.options["durationMs"] ?? 5_000), signal),
    "development.fail": async (data) => {
      if (data.options["permanent"] === true)
        throw new PermanentJobError("Intentional permanent development failure");
      throw new Error("Intentional transient development failure");
    },
  };
}

async function reconcilePending(
  database: KnownPathDatabase,
  producer: JobProducer,
): Promise<{ redispatched: number; contributionCanonicalizations: number }> {
  const pending = await database.repositories.pipelineSteps.listPendingDispatch(100);
  let redispatched = 0;
  for (const step of pending) {
    await producer.redispatch(step);
    redispatched += 1;
  }
  let contributionCanonicalizations = 0;
  const approved =
    await database.repositories.agentContributions.listApprovedAwaitingCanonicalization(100);
  for (const contribution of approved) {
    const candidateId = contribution.processing.candidateExperienceId;
    if (candidateId === undefined) continue;
    const membership =
      await database.repositories.canonicalMemberships.findActiveSupportingByCandidate(candidateId);
    if (membership !== null) {
      await database.repositories.agentContributions.updateProcessing(contribution._id, {
        ...contribution.processing,
        stage: "canonicalized",
        canonicalKnownPathId: membership.knownPathId,
        completedAt: new Date(),
      });
      continue;
    }
    const queued = await producer.enqueue({
      jobName: "candidate.canonicalize",
      kind: "contribution",
      target: { kind: "candidate", id: candidateId },
      trigger: "reconciliation",
      options: { contributionId: contribution._id },
      idempotencyParts: contributionCanonicalizationJobKey(contribution),
    });
    await database.repositories.agentContributions.updateProcessing(contribution._id, {
      ...contribution.processing,
      stage: "canonicalization_queued",
      canonicalizationStepId: queued.data.pipelineStepId,
    });
    contributionCanonicalizations += 1;
  }
  return { redispatched, contributionCanonicalizations };
}

async function contributionForCandidate(
  database: KnownPathDatabase,
  candidateId: CandidateExperienceId,
) {
  const candidate = await database.repositories.candidateExperiences.findById(candidateId);
  if (candidate?.contribution === undefined) return null;
  const contribution = await database.repositories.agentContributions.findById(
    candidate.contribution.contributionId,
  );
  return contribution?.schemaVersion === 2 ? contribution : null;
}

async function hold(durationMs: number, signal: AbortSignal): Promise<{ heldMs: number }> {
  const bounded = Math.max(100, Math.min(durationMs, 60_000));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, bounded);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
  return { heldMs: bounded };
}
