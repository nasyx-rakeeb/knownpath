import type { JobsOptions } from "bullmq";
import type { PipelineJobName } from "@knownpath/domain";
import type { QueueConfig } from "@knownpath/config";

interface RetryPolicy {
  readonly attempts: number;
  readonly delayMs: number;
}

const defaultPolicy: RetryPolicy = { attempts: 5, delayMs: 2_000 };

const policies: Partial<Record<PipelineJobName, RetryPolicy>> = {
  "source.github.sync": { attempts: 5, delayMs: 5_000 },
  "source.official.sync": { attempts: 5, delayMs: 2_000 },
  "source.extract": { attempts: 4, delayMs: 10_000 },
  "knownpath.reembed": { attempts: 4, delayMs: 10_000 },
  "development.fail": { attempts: 3, delayMs: 1_000 },
};

export function retryPolicyFor(jobName: PipelineJobName): RetryPolicy {
  return policies[jobName] ?? defaultPolicy;
}

export function jobOptionsFor(jobName: PipelineJobName, config: QueueConfig): JobsOptions {
  const policy = retryPolicyFor(jobName);
  return {
    attempts: policy.attempts,
    backoff: { type: "exponential", delay: policy.delayMs, jitter: 0.5 },
    removeOnComplete: {
      age: config.retention.completed.ageSeconds,
      count: config.retention.completed.count,
    },
    removeOnFail: {
      age: config.retention.failed.ageSeconds,
      count: config.retention.failed.count,
    },
  };
}
