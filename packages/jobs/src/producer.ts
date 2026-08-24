import {
  CURRENT_SCHEMA_VERSION,
  createPipelineRunId,
  createPipelineStepId,
  createVersionedKey,
  pipelineJobNameSchema,
  pipelineRunSchema,
  pipelineStepSchema,
  type PipelineRun,
  type PipelineRunKind,
  type PipelineRunId,
  type PipelineTarget,
  type PipelineStep,
  type PipelineTrigger,
} from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";
import type { QueueConfig } from "@knownpath/config";

import {
  operationalJobDataSchema,
  parseJobOptions,
  queueForJob,
  stableDigest,
  type OperationalJobData,
} from "./contracts.js";
import { QueueRegistry } from "./client.js";
import { jobOptionsFor, retryPolicyFor } from "./policy.js";

export interface EnqueueRequest {
  readonly jobName: string;
  readonly kind: PipelineRunKind;
  readonly target: PipelineTarget;
  readonly trigger: PipelineTrigger;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly pipelineRunId?: PipelineRunId;
  readonly chainDepth?: number;
  readonly processingVersions?: Readonly<Record<string, string>>;
  readonly idempotencyParts?: readonly string[];
}

export interface EnqueueResult {
  readonly run: PipelineRun;
  readonly data: OperationalJobData;
  readonly deduplicated: boolean;
}

export class JobProducer {
  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly queues: QueueRegistry,
    private readonly config: QueueConfig,
  ) {}

  public async enqueue(request: EnqueueRequest): Promise<EnqueueResult> {
    const jobName = pipelineJobNameSchema.parse(request.jobName);
    const queueName = queueForJob[jobName];
    const options = parseJobOptions(jobName, request.options);
    const now = new Date();
    const idempotencyKey = createVersionedKey(
      request.idempotencyParts ?? [
        jobName,
        request.target.kind,
        request.target.id,
        stableDigest(options),
      ],
    );
    const existing =
      await this.database.repositories.pipelineSteps.findByIdempotencyKey(idempotencyKey);
    if (existing !== null) {
      if (existing.status === "pending_dispatch") await this.redispatch(existing);
      const data = operationalJobDataSchema.parse({
        pipelineRunId: existing.pipelineRunId,
        pipelineStepId: existing._id,
        jobName: existing.jobName,
        queueName: existing.queueName,
        target: existing.target,
        trigger: existing.trigger,
        chainDepth: existing.chainDepth,
        options: existing.payload,
        contractVersion: 1,
      });
      return { run: await this.requireRun(existing.pipelineRunId), data, deduplicated: true };
    }
    const run =
      request.pipelineRunId === undefined
        ? await this.database.repositories.pipelineRuns.create(
            pipelineRunSchema.parse({
              _id: createPipelineRunId(),
              schemaVersion: CURRENT_SCHEMA_VERSION,
              kind: request.kind,
              trigger: request.trigger,
              status: "queued",
              scope: { target: request.target, requestedJobName: jobName },
              counters: {
                total: 1,
                waiting: 1,
                active: 0,
                completed: 0,
                failed: 0,
                quarantined: 0,
              },
              audit: { createdAt: now, updatedAt: now },
            }),
          )
        : await this.requireRun(request.pipelineRunId);
    const jobId = idempotencyKey.value;
    const step = pipelineStepSchema.parse({
      _id: createPipelineStepId(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      pipelineRunId: run._id,
      jobName,
      queueName,
      target: request.target,
      idempotencyKey,
      payloadDigest: stableDigest(options),
      payload: options,
      bullmqJobId: jobId,
      trigger: request.trigger,
      chainDepth: request.chainDepth ?? 0,
      status: "pending_dispatch",
      attemptsMade: 0,
      maxAttempts: retryPolicyFor(jobName).attempts,
      processingVersions: { jobContract: "1", ...(request.processingVersions ?? {}) },
      audit: { createdAt: now, updatedAt: now },
    });
    const inserted = await this.database.repositories.pipelineSteps.createIfAbsent(step);
    const stored =
      inserted ??
      (await this.database.repositories.pipelineSteps.findByIdempotencyKey(idempotencyKey));
    if (stored === null) throw new Error("Pipeline step idempotency resolution failed");
    const data = operationalJobDataSchema.parse({
      pipelineRunId: stored.pipelineRunId,
      contractVersion: 1,
      pipelineStepId: stored._id,
      jobName: stored.jobName,
      queueName: stored.queueName,
      target: stored.target,
      trigger: stored.trigger,
      chainDepth: stored.chainDepth,
      options,
    });
    await this.dispatch(
      this.queues.get(queueName).add(jobName, data, {
        ...jobOptionsFor(jobName, this.config),
        jobId,
      }),
    );
    if (stored.status === "pending_dispatch")
      await this.database.repositories.pipelineSteps.updateState(stored._id, {
        status: "waiting",
        dispatchedAt: now,
      });
    await refreshPipelineRun(this.database, stored.pipelineRunId);
    return {
      run: await this.requireRun(stored.pipelineRunId),
      data,
      deduplicated: inserted === null,
    };
  }

  public async redispatch(step: PipelineStep): Promise<void> {
    const data = operationalJobDataSchema.parse({
      pipelineRunId: step.pipelineRunId,
      contractVersion: 1,
      pipelineStepId: step._id,
      jobName: step.jobName,
      queueName: step.queueName,
      target: step.target,
      trigger: step.trigger,
      chainDepth: step.chainDepth,
      options: step.payload,
    });
    await this.dispatch(
      this.queues.get(step.queueName).add(step.jobName, data, {
        ...jobOptionsFor(step.jobName, this.config),
        jobId: step.bullmqJobId,
      }),
    );
    await this.database.repositories.pipelineSteps.updateState(step._id, {
      status: "waiting",
      dispatchedAt: new Date(),
    });
    await refreshPipelineRun(this.database, step.pipelineRunId);
  }

  private async requireRun(id: PipelineRunId): Promise<PipelineRun> {
    const run = await this.database.repositories.pipelineRuns.findById(id);
    if (run === null) throw new Error(`Pipeline run not found: ${id}`);
    return run;
  }

  private async dispatch<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error("Valkey queue dispatch timed out; durable intent remains pending")),
            this.config.producerConnectTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

export async function refreshPipelineRun(
  database: KnownPathDatabase,
  runId: PipelineRunId,
): Promise<void> {
  const current = await database.repositories.pipelineRuns.findById(runId);
  if (current === null) throw new Error(`Pipeline run not found: ${runId}`);
  const steps = await database.repositories.pipelineSteps.listByRun(runId);
  const count = (status: string) => steps.filter((step) => step.status === status).length;
  const active = count("active") + count("retrying");
  const waiting = count("pending_dispatch") + count("waiting");
  const completed = count("completed");
  const failed = count("failed");
  const quarantined = count("quarantined");
  const terminal = completed + failed + quarantined === steps.length;
  const status = terminal
    ? quarantined > 0
      ? "quarantined"
      : failed > 0
        ? completed > 0
          ? "partially_completed"
          : "failed"
        : "completed"
    : active > 0
      ? "running"
      : "queued";
  await database.repositories.pipelineRuns.updateState(runId, {
    status,
    counters: { total: steps.length, waiting, active, completed, failed, quarantined },
    ...(status === "running" && current.startedAt === undefined ? { startedAt: new Date() } : {}),
    ...(terminal && current.completedAt === undefined ? { completedAt: new Date() } : {}),
  });
}
