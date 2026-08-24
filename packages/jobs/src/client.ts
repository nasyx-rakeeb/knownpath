import { createIORedisClient, Queue, type IRedisClient } from "bullmq";
import { Redis } from "ioredis";

import type { QueueConfig } from "@knownpath/config";
import type { PipelineQueueName } from "@knownpath/domain";

export function createValkeyConnection(redisUrl: string, worker = false): IRedisClient {
  const client = new Redis(redisUrl, {
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: worker ? null : 1,
  });
  client.on("error", () => undefined);
  return createIORedisClient(client);
}

export class QueueRegistry {
  private readonly queues = new Map<PipelineQueueName, Queue>();

  public constructor(
    connection: IRedisClient,
    private readonly config: QueueConfig,
  ) {
    for (const name of ["control", "github", "sources", "ai", "knowledge", "feedback"] as const) {
      const queue = new Queue(name, {
        connection,
        prefix: this.config.prefix,
        skipVersionCheck: false,
      });
      queue.on("error", () => undefined);
      this.queues.set(name, queue);
    }
  }

  public get(name: PipelineQueueName): Queue {
    const queue = this.queues.get(name);
    if (queue === undefined) throw new Error(`Unknown queue: ${name}`);
    return queue;
  }

  public async waitUntilReady(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.waitUntilReady()));
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  public async status(): Promise<Record<PipelineQueueName, Record<string, number>>> {
    const output = {} as Record<PipelineQueueName, Record<string, number>>;
    for (const [name, queue] of this.queues) {
      output[name] = await queue.getJobCounts(
        "active",
        "completed",
        "delayed",
        "failed",
        "prioritized",
        "waiting",
        "waiting-children",
      );
    }
    return output;
  }

  public async waitUntilRunnableIdle(
    options: {
      readonly idleMs: number;
      readonly maxRuntimeMs: number;
      readonly pollMs: number;
    },
    signal?: AbortSignal,
  ): Promise<{
    readonly status: "aborted" | "idle" | "timeout";
    readonly elapsedMs: number;
    readonly runnableJobs: number;
  }> {
    const startedAt = Date.now();
    let idleSince: number | undefined;

    while (true) {
      if (signal?.aborted === true)
        return { status: "aborted", elapsedMs: Date.now() - startedAt, runnableJobs: 0 };

      const runnableJobs = await this.countRunnableJobs();
      const now = Date.now();
      if (runnableJobs === 0) {
        idleSince ??= now;
        if (now - idleSince >= options.idleMs)
          return { status: "idle", elapsedMs: now - startedAt, runnableJobs };
      } else {
        idleSince = undefined;
      }

      if (now - startedAt >= options.maxRuntimeMs)
        return { status: "timeout", elapsedMs: now - startedAt, runnableJobs };

      await abortableDelay(
        Math.min(options.pollMs, Math.max(1, options.maxRuntimeMs - (now - startedAt))),
        signal,
      );
    }
  }

  public async probe(
    timeoutMs = this.config.producerConnectTimeoutMs,
  ): Promise<"ok" | "unavailable"> {
    try {
      await withTimeout(this.get("control").getJobCounts("waiting"), timeoutMs);
      return "ok";
    } catch {
      return "unavailable";
    }
  }

  private async countRunnableJobs(): Promise<number> {
    let count = 0;
    for (const queue of this.queues.values()) {
      const counts = await queue.getJobCounts("active", "prioritized", "waiting");
      count += (counts["active"] ?? 0) + (counts["prioritized"] ?? 0) + (counts["waiting"] ?? 0);
    }
    return count;
  }
}

async function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, delayMs);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Valkey operation timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
