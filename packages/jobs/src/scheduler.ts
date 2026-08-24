import { Queue, type IRedisClient } from "bullmq";
import {
  pipelineJobNameSchema,
  pipelineTargetSchema,
  pipelineRunKindSchema,
} from "@knownpath/domain";
import type { QueueConfig } from "@knownpath/config";
import { z } from "zod";

export const scheduledDispatchDataSchema = z.strictObject({
  kind: z.literal("scheduled_dispatch"),
  jobName: pipelineJobNameSchema,
  runKind: pipelineRunKindSchema,
  target: pipelineTargetSchema,
  options: z.record(z.string(), z.unknown()).default({}),
});

export type ScheduledDispatchData = z.infer<typeof scheduledDispatchDataSchema>;

const maintenanceSchedules = [
  {
    id: "reconcile-pending-v1",
    every: 5 * 60 * 1_000,
    data: {
      kind: "scheduled_dispatch",
      jobName: "maintenance.reconcile",
      runKind: "maintenance",
      target: { kind: "system", id: "pending-dispatch" },
      options: {},
    },
  },
  {
    id: "recover-stale-v1",
    every: 15 * 60 * 1_000,
    data: {
      kind: "scheduled_dispatch",
      jobName: "maintenance.retry-stale",
      runKind: "maintenance",
      target: { kind: "system", id: "stale-jobs" },
      options: {},
    },
  },
  {
    id: "freshness-rescore-v1",
    every: 24 * 60 * 60 * 1_000,
    data: {
      kind: "scheduled_dispatch",
      jobName: "knowledge.freshness.rescore",
      runKind: "maintenance",
      target: { kind: "system", id: "all-knownpaths" },
      options: {},
    },
  },
] as const;

export interface SourceSchedulePolicy {
  readonly sourceKey: string;
  readonly jobName: "source.github.sync" | "source.official.sync";
  readonly everyMs: number;
  readonly options?: Readonly<Record<string, unknown>>;
}

export class ScheduleManager {
  private readonly queue: Queue;

  public constructor(connection: IRedisClient, config: QueueConfig) {
    this.queue = new Queue("control", { connection, prefix: config.prefix });
    this.queue.on("error", () => undefined);
  }

  public async apply(sourcePolicies: readonly SourceSchedulePolicy[]): Promise<readonly string[]> {
    const sourceSchedules = sourcePolicies.map((policy) => ({
      id: `source-${policy.sourceKey}-v1`,
      every: policy.everyMs,
      data: {
        kind: "scheduled_dispatch" as const,
        jobName: policy.jobName,
        runKind: "source_sync" as const,
        target: { kind: "source_registry" as const, id: policy.sourceKey },
        options: policy.options ?? {},
      },
    }));
    const schedules = [...sourceSchedules, ...maintenanceSchedules];
    for (const schedule of schedules) {
      await this.queue.upsertJobScheduler(
        schedule.id,
        { every: schedule.every },
        { name: "schedule.dispatch", data: scheduledDispatchDataSchema.parse(schedule.data) },
      );
    }
    return schedules.map(({ id }) => id);
  }

  public async remove(): Promise<readonly string[]> {
    const removed: string[] = [];
    const existing = await this.queue.getJobSchedulers(0, 1_000, true);
    for (const { key } of existing) {
      if (
        (key.startsWith("source-") || maintenanceSchedules.some(({ id }) => id === key)) &&
        (await this.queue.removeJobScheduler(key))
      )
        removed.push(key);
    }
    return removed;
  }

  public async list(): Promise<unknown> {
    return this.queue.getJobSchedulers(0, 100, true);
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
