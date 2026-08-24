import { Queue, Worker, UnrecoverableError, type IRedisClient, type Job } from "bullmq";
import {
  CURRENT_SCHEMA_VERSION,
  createWorkerHeartbeatId,
  workerHeartbeatSchema,
  type PipelineJobName,
  type PipelineQueueName,
} from "@knownpath/domain";
import type { KnownPathDatabase } from "@knownpath/database";
import type { QueueConfig } from "@knownpath/config";

import {
  operationalJobDataSchema,
  PermanentJobError,
  type OperationalJobData,
} from "./contracts.js";
import { refreshPipelineRun } from "./producer.js";
import { scheduledDispatchDataSchema, type ScheduledDispatchData } from "./scheduler.js";

export type OperationalJobHandler = (
  data: OperationalJobData,
  signal: AbortSignal,
) => Promise<unknown>;

export class OperationalWorkerRuntime {
  private readonly workers: Worker[] = [];
  private readonly limiterQueues: Queue[] = [];
  private readonly workerId = createWorkerHeartbeatId();
  private readonly startedAt = new Date();
  private heartbeatTimer?: NodeJS.Timeout;
  private activeJobs = 0;

  public constructor(
    private readonly database: KnownPathDatabase,
    private readonly connection: IRedisClient,
    private readonly config: QueueConfig,
    private readonly handlers: Readonly<Record<PipelineJobName, OperationalJobHandler>>,
    private readonly version: string,
    private readonly dispatchScheduled?: (data: ScheduledDispatchData) => Promise<unknown>,
  ) {}

  public async start(): Promise<void> {
    const queues = ["control", "github", "sources", "ai", "knowledge", "feedback"] as const;
    await this.writeHeartbeat("starting", queues);
    for (const queueName of queues) {
      const worker = new Worker<unknown>(
        queueName,
        async (job, _token, signal) => this.process(job, signal ?? new AbortController().signal),
        {
          connection: this.connection,
          prefix: this.config.prefix,
          concurrency: this.config.concurrency[queueName],
          lockDuration: this.config.workerLockMs,
          maxStalledCount: this.config.maxStalledCount,
        },
      );
      worker.on("error", () => undefined);
      this.workers.push(worker);
    }
    await Promise.all(this.workers.map((worker) => worker.waitUntilReady()));
    await this.configureRateLimits();
    await this.writeHeartbeat("ready", queues);
    this.heartbeatTimer = setInterval(
      () => void this.writeHeartbeat("ready", queues),
      this.config.workerHeartbeatMs,
    );
    this.heartbeatTimer.unref();
  }

  public async close(): Promise<void> {
    if (this.heartbeatTimer !== undefined) clearInterval(this.heartbeatTimer);
    const queues = this.workers.map((worker) => worker.name as PipelineQueueName);
    await this.writeHeartbeat("stopping", queues);
    const graceful = Promise.all(this.workers.map((worker) => worker.close(false)));
    let timer: NodeJS.Timeout | undefined;
    const completed = await Promise.race([
      graceful.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), this.config.workerShutdownMs);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    if (!completed) await Promise.all(this.workers.map((worker) => worker.close(true)));
    await Promise.all(this.limiterQueues.map((queue) => queue.close()));
    await this.writeHeartbeat("stopped", queues);
  }

  private async process(job: Job<unknown>, signal: AbortSignal): Promise<unknown> {
    if (job.name === "schedule.dispatch") {
      if (this.dispatchScheduled === undefined)
        throw new UnrecoverableError("Scheduled dispatch is not configured");
      return this.dispatchScheduled(scheduledDispatchDataSchema.parse(job.data));
    }
    const data = operationalJobDataSchema.parse(job.data);
    const handler = this.handlers[data.jobName];
    if (handler === undefined)
      throw new UnrecoverableError(`No handler registered for ${data.jobName}`);
    this.activeJobs += 1;
    await this.database.repositories.pipelineSteps.updateState(data.pipelineStepId, {
      status: "active",
      attemptsMade: job.attemptsMade + 1,
      startedAt: new Date(),
    });
    await refreshPipelineRun(this.database, data.pipelineRunId);
    try {
      const result = await handler(data, signal);
      await this.database.repositories.pipelineSteps.updateState(data.pipelineStepId, {
        status: "completed",
        completedAt: new Date(),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown pipeline failure";
      const permanent = error instanceof UnrecoverableError || error instanceof PermanentJobError;
      const exhausted = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      await this.database.repositories.pipelineSteps.updateState(data.pipelineStepId, {
        status: exhausted ? "quarantined" : "retrying",
        attemptsMade: job.attemptsMade + 1,
        lastError: {
          code: permanent ? "permanent_job_error" : "job_execution_failed",
          message: message.slice(0, 1_000),
          occurredAt: new Date(),
        },
        ...(exhausted
          ? {
              completedAt: new Date(),
              quarantineReason: permanent ? "permanent_failure" : "retry_limit_exhausted",
            }
          : {}),
      });
      if (permanent && !(error instanceof UnrecoverableError))
        throw new UnrecoverableError(message);
      throw error;
    } finally {
      this.activeJobs -= 1;
      await refreshPipelineRun(this.database, data.pipelineRunId);
    }
  }

  private async configureRateLimits(): Promise<void> {
    for (const name of ["github", "sources", "ai"] as const) {
      const queue = new Queue(name, { connection: this.connection, prefix: this.config.prefix });
      queue.on("error", () => undefined);
      this.limiterQueues.push(queue);
      if (name === "github" || name === "sources" || name === "ai") {
        const limiter = this.config.limiters[name];
        await queue.setGlobalRateLimit(limiter.max, limiter.durationMs);
      }
    }
  }

  private async writeHeartbeat(
    state: "starting" | "ready" | "stopping" | "stopped",
    queues: readonly PipelineQueueName[],
  ): Promise<void> {
    const now = new Date();
    await this.database.repositories.workerHeartbeats.upsert(
      workerHeartbeatSchema.parse({
        _id: this.workerId,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        workerVersion: this.version,
        queues,
        state,
        activeJobs: this.activeJobs,
        startedAt: this.startedAt,
        lastHeartbeatAt: now,
        ...(state === "stopping" ? { stoppingAt: now } : {}),
        ...(state === "stopped" ? { stoppedAt: now } : {}),
        expiresAt: new Date(now.getTime() + this.config.workerStaleMs * 10),
        audit: { createdAt: this.startedAt, updatedAt: now },
      }),
    );
  }
}
