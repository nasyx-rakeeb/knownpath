import {
  loadAiExtractionConfig,
  loadAuthConfig,
  loadEmbeddingConfig,
  loadGitHubConfig,
  loadMongoConfig,
  loadQueueConfig,
  loadSourceIngestionConfig,
  requireQueueRedisUrl,
} from "@knownpath/config";
import { connectToMongo } from "@knownpath/database";
import {
  pipelineJobNameSchema,
  pipelineTargetSchema,
  sourceItemIdSchema,
  type SourceItemId,
} from "@knownpath/domain";
import {
  createValkeyConnection,
  JobProducer,
  OperationalWorkerRuntime,
  PermanentJobError,
  QueueRegistry,
  ScheduleManager,
  queueForJob,
} from "@knownpath/jobs";
import { createPipelineHandlers, type PipelineServices } from "@knownpath/pipelines";
import {
  ExtractionService,
  GeminiExtractionProvider,
  geminiGenerationConfigId,
} from "@knownpath/ai";
import {
  CandidateDiscoveryService,
  CandidateEmbeddingService,
  CandidatePairService,
  CanonicalRecordService,
  SimilarityProfileService,
} from "@knownpath/canonicalization";
import { ContributionService } from "@knownpath/contributions";
import { GitHubIngestionService, type GitHubIngestionLogger } from "@knownpath/github-ingestion";
import { OutcomeService } from "@knownpath/outcomes";
import { GeminiEmbeddingProvider, SearchProjectionService } from "@knownpath/search";
import { OfficialSourceIngestionService, loadSourceManifest } from "@knownpath/source-ingestion";
import { CandidateAssessmentService, defaultScoringPolicy } from "@knownpath/verification";

const usage = `KnownPath operational jobs

  jobs start
  jobs drain [--allow-incomplete]
  jobs enqueue <job-name> --target-kind <kind> --target-id <id> [--options-json <json>]
  jobs status
  jobs pause [queue]
  jobs resume [queue]
  jobs retry-failed [queue]
  jobs recover-extractions [--limit <n>]
  jobs schedules <apply|remove|status>

Valkey is required through QUEUE_REDIS_URL. Product data remains in MongoDB.`;

export async function runOperationalCommand(argv: readonly string[]): Promise<void> {
  const action = argv[0];
  if (action === undefined || action === "help" || action === "--help") {
    console.info(usage);
    return;
  }
  const queueConfig = loadQueueConfig();
  const workerAction = action === "start" || action === "drain";
  const connection = createValkeyConnection(requireQueueRedisUrl(queueConfig), workerAction);
  const queues = new QueueRegistry(connection, queueConfig);
  const database = await connectToMongo(loadMongoConfig());
  try {
    if ((await queues.probe()) !== "ok")
      throw new Error("Valkey queue infrastructure is unavailable");
    await queues.waitUntilReady();
    const producer = new JobProducer(database, queues, queueConfig);
    if (workerAction) {
      const services = await createOperationalServices(database);
      const runtime = new OperationalWorkerRuntime(
        database,
        connection,
        queueConfig,
        createPipelineHandlers(database, producer, services),
        "knownpath-worker-v1",
        async (scheduled) =>
          producer.enqueue({
            jobName: scheduled.jobName,
            kind: scheduled.runKind,
            target: scheduled.target,
            trigger: "scheduler",
            options: scheduled.options,
            idempotencyParts: [
              "scheduled",
              scheduled.jobName,
              scheduled.target.id,
              new Date().toISOString().slice(0, 16),
            ],
          }),
      );
      await runtime.start();
      console.info(
        JSON.stringify({
          event: "worker.ready",
          mode: action,
          queues: Object.keys(queueConfig.concurrency),
        }),
      );
      if (action === "start") {
        await waitForShutdown();
        await runtime.close();
        return;
      }
      const shutdown = createShutdownSignal();
      const result = await (async () => {
        try {
          return await queues.waitUntilRunnableIdle(queueConfig.drain, shutdown.signal);
        } finally {
          shutdown.dispose();
          await runtime.close();
        }
      })();
      console.info(JSON.stringify({ event: "worker.drain.complete", ...result }));
      if (result.status === "timeout" && !argv.includes("--allow-incomplete"))
        throw new Error(
          `Queue drain exceeded ${queueConfig.drain.maxRuntimeMs}ms with ${result.runnableJobs} runnable jobs`,
        );
      return;
    }
    if (action === "status") {
      const recentWorkers = await database.repositories.workerHeartbeats.listRecent(
        new Date(Date.now() - queueConfig.workerStaleMs),
      );
      console.info(
        JSON.stringify({ queues: await queues.status(), workers: recentWorkers }, null, 2),
      );
      return;
    }
    if (action === "schedules") {
      const manager = new ScheduleManager(connection, queueConfig);
      try {
        const operation = argv[1] ?? "status";
        if (!queueConfig.schedulesEnabled && operation === "apply")
          throw new Error("QUEUE_SCHEDULES_ENABLED=true is required to apply schedules");
        const sourceManifest =
          operation === "apply" && queueConfig.sourceSchedulesEnabled
            ? await loadSourceManifest(loadSourceIngestionConfig().sourceRegistryPath)
            : undefined;
        const sourcePolicies =
          sourceManifest?.sources
            .filter((source) => source.enabled)
            .map((source) => ({
              sourceKey: source.key,
              jobName:
                source.adapter === "github_repository"
                  ? ("source.github.sync" as const)
                  : ("source.official.sync" as const),
              everyMs: source.refreshIntervalMinutes * 60_000,
              options:
                source.adapter === "github_repository"
                  ? { extractionLimit: 20, limit: 5 }
                  : { extractionLimit: 20, limit: 10, scope: "curated" },
            })) ?? [];
        const result =
          operation === "apply"
            ? await manager.apply(sourcePolicies)
            : operation === "remove"
              ? await manager.remove()
              : await manager.list();
        console.info(JSON.stringify({ operation, result }, null, 2));
      } finally {
        await manager.close();
      }
      return;
    }
    if (action === "pause" || action === "resume" || action === "retry-failed") {
      const selected = selectQueues(argv[1]);
      for (const name of selected) {
        const queue = queues.get(name);
        if (action === "pause") await queue.pause();
        else if (action === "resume") await queue.resume();
        else await queue.retryJobs({ state: "failed", count: 100, timestamp: Date.now() });
      }
      console.info(JSON.stringify({ action, queues: selected }));
      return;
    }
    if (action === "recover-extractions") {
      const limit = positiveIntegerFlag(argv, "--limit", 20, 100);
      const failures =
        await database.repositories.extractionAttempts.listLatestRetryableFailures(limit);
      let enqueued = 0;
      let deduplicated = 0;
      for (const failure of failures) {
        const result = await producer.enqueue({
          jobName: "source.extract",
          kind: "reprocess",
          target: { kind: "source_item", id: failure.targetSourceItemId },
          trigger: "operator",
          options: { force: true },
          idempotencyParts: ["recover-extraction", failure._id],
        });
        if (result.deduplicated) deduplicated += 1;
        else enqueued += 1;
      }
      console.info(JSON.stringify({ action, selected: failures.length, enqueued, deduplicated }));
      return;
    }
    if (action === "enqueue") {
      const jobName = pipelineJobNameSchema.parse(argv[1]);
      const target = pipelineTargetSchema.parse({
        kind: requireFlag(argv, "--target-kind"),
        id: requireFlag(argv, "--target-id"),
      });
      const rawOptions = optionalFlag(argv, "--options-json");
      const options = rawOptions === undefined ? {} : parseOptions(rawOptions);
      const result = await producer.enqueue({
        jobName,
        kind: kindForJob(jobName),
        target,
        trigger: "operator",
        options,
      });
      console.info(
        JSON.stringify({
          pipelineRunId: result.run._id,
          pipelineStepId: result.data.pipelineStepId,
          queueName: queueForJob[jobName],
          deduplicated: result.deduplicated,
        }),
      );
      return;
    }
    throw new Error(usage);
  } finally {
    await queues.close();
    connection.disconnect();
    await database.close();
  }
}

async function createOperationalServices(
  database: Awaited<ReturnType<typeof connectToMongo>>,
): Promise<PipelineServices> {
  const ai = loadAiExtractionConfig();
  const embeddings = loadEmbeddingConfig();
  const auth = loadAuthConfig();
  const logger = safeLogger();
  const extraction = new ExtractionService(database, {
    dataHandling: ai.dataHandling,
    generationConfigId: geminiGenerationConfigId(ai.model),
    maxEstimatedInputTokens: ai.maxEstimatedInputTokens,
    maxOutputTokens: ai.maxOutputTokens,
    maxRetries: ai.maxRetries,
    minRequestSpacingMs: ai.minRequestSpacingMs,
    model: ai.model,
    providerCapability: "public_only",
    providerIdentifier: ai.provider,
    providerFactory: () => {
      if (ai.geminiApiKey === undefined)
        throw new Error("GEMINI_API_KEY is required for extraction jobs");
      return new GeminiExtractionProvider({
        apiKey: ai.geminiApiKey,
        model: ai.model,
        requestTimeoutMs: ai.requestTimeoutMs,
      });
    },
  });
  const scoring = new CandidateAssessmentService(database, defaultScoringPolicy);
  const profiles = new SimilarityProfileService(database);
  const embeddingProvider =
    embeddings.geminiApiKey === undefined
      ? undefined
      : () =>
          new GeminiEmbeddingProvider({
            apiKey: embeddings.geminiApiKey ?? "",
            modelIdentifier: embeddings.model,
            modelVersion: embeddings.modelVersion,
            requestTimeoutMs: embeddings.requestTimeoutMs,
          });
  const candidateEmbeddings =
    embeddingProvider === undefined
      ? undefined
      : new CandidateEmbeddingService(database, {
          dimensions: embeddings.dimensions,
          maxProviderCalls: embeddings.maxProviderCalls,
          maxRetries: embeddings.maxRetries,
          minRequestSpacingMs: embeddings.minRequestSpacingMs,
          providerCapability: "public_only",
          providerIdentifier: embeddings.provider,
          providerModel: embeddings.model,
          providerModelVersion: embeddings.modelVersion,
          providerFactory: embeddingProvider,
        });
  const pairs = new CandidatePairService(database, candidateEmbeddings);
  const discovery = new CandidateDiscoveryService(database, profiles, pairs);
  const canonicals = new CanonicalRecordService(database);
  const projections = new SearchProjectionService(database, {
    dimensions: embeddings.dimensions,
    providerCapability: "public_only",
    providerIdentifier: embeddings.provider,
    providerModel: embeddings.model,
    providerModelVersion: embeddings.modelVersion,
    ...(embeddingProvider === undefined ? {} : { providerFactory: embeddingProvider }),
  });
  const contributions = new ContributionService(database, {
    apiOrigin: auth.baseUrl,
    digestSecret: auth.apiKeyPepper,
  });
  const outcomes = new OutcomeService(database);

  return {
    syncGitHub: async (target, options, signal) => {
      const startedAt = new Date();
      const results = await new GitHubIngestionService(
        database,
        loadGitHubConfig(),
        logger,
        signal,
      ).run({
        backfill: options["backfill"] === true,
        dryRun: false,
        limit: numberOption(options, "limit", 25),
        ...(target === "all" ? { all: true } : { source: target }),
      });
      return latestItems(
        database,
        results.flatMap((result) => (result.registry === null ? [] : [result.registry._id])),
        numberOption(options, "extractionLimit", 100),
        startedAt,
      );
    },
    syncOfficial: async (target, options, signal) => {
      const startedAt = new Date();
      const results = await new OfficialSourceIngestionService(
        database,
        loadSourceIngestionConfig(),
        logger,
        signal,
      ).run({
        action: "sync",
        dryRun: false,
        limit: numberOption(options, "limit", 25),
        scope: options["scope"] === "all" ? "all" : "curated",
        ...(typeof options["page"] === "string" ? { page: options["page"] } : {}),
        ...(typeof options["version"] === "string" ? { version: options["version"] } : {}),
        ...(target === "all" ? { all: true } : { source: target }),
      });
      return latestItems(
        database,
        results.flatMap((result) => (result.registry === null ? [] : [result.registry._id])),
        numberOption(options, "extractionLimit", 100),
        startedAt,
      );
    },
    extract: async (id, options) => {
      const item = await database.repositories.sourceItems.findById(id);
      if (item === null) throw new Error(`Source item not found: ${id}`);
      const result = await extraction.processOne(
        item,
        options["force"] === true,
        Math.min(ai.maxProviderCalls, ai.maxRetries + 1),
      );
      if (result.attempt.status === "failed") {
        throw new PermanentJobError(
          result.attempt.failureMessage ?? "Extraction failed and requires explicit recovery",
        );
      }
      return result.attempt.candidateExperienceId;
    },
    score: async (id) => {
      await scoring.assess(id, { evaluatedAt: new Date() });
    },
    canonicalize: async (id) => {
      const existing =
        await database.repositories.canonicalMemberships.findActiveSupportingByCandidate(id);
      if (existing !== null) {
        await canonicals.rebuild(existing.knownPathId, undefined, "operational_pipeline_rebuild");
        return [existing.knownPathId];
      }
      const summary = await discovery.discoverForCandidate(id, candidateEmbeddings !== undefined);
      const automatic = summary.pairs.find((pair) => pair.decision === "auto_merge");
      const result = await canonicals.mergeCandidates({
        candidateIds: automatic?.candidateIds ?? [id],
        reason:
          automatic === undefined
            ? "operational_pipeline_new_record"
            : "operational_pipeline_deterministic_auto_merge",
        ...(automatic === undefined ? {} : { pairAssessmentId: automatic._id }),
      });
      return [result.knownPath._id];
    },
    project: async (id, useEmbedding) => {
      await projections.project(id, useEmbedding);
    },
    processContribution: async (id) => {
      const contribution = await contributions.process(id as never);
      return contribution.processing.candidateExperienceId;
    },
    aggregateOutcome: async (id) => {
      await outcomes.recompute(id);
    },
    rescoreFreshness: async () => {
      const records = await database.repositories.knownPaths.listForOutcomeAssessment(100);
      for (const record of records) await outcomes.recompute(record._id);
      return records.map((record) => record._id);
    },
    reembed: async (id) => {
      if (embeddingProvider === undefined)
        throw new Error("GEMINI_API_KEY is required for re-embedding jobs");
      await projections.project(id, true);
    },
  };
}

async function latestItems(
  database: Awaited<ReturnType<typeof connectToMongo>>,
  registryIds: readonly string[],
  limit: number,
  capturedSince: Date,
): Promise<SourceItemId[]> {
  const items = [];
  for (const registryId of registryIds) {
    const selected = await database.repositories.sourceItems.listLatestExtractionTargets(
      limit,
      registryId as never,
      capturedSince,
    );
    items.push(...selected.map((item) => item._id));
  }
  return [...new Set(items)].map((id) => sourceItemIdSchema.parse(id));
}

function safeLogger(): GitHubIngestionLogger {
  const write = (
    level: "debug" | "error" | "info" | "warn",
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ) =>
    console[level](
      JSON.stringify({ level, message, ...(context === undefined ? {} : { context }) }),
    );
  return {
    debug: (message, context) => write("debug", message, context),
    error: (message, context) => write("error", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
  };
}

function numberOption(
  options: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
): number {
  const value = options[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function positiveIntegerFlag(
  argv: readonly string[],
  flag: string,
  fallback: number,
  maximum: number,
): number {
  const raw = optionalFlag(argv, flag);
  if (raw === undefined) return fallback;
  if (!/^\d+$/u.test(raw)) throw new Error(`${flag} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(`${flag} must be between 1 and ${maximum}`);
  return value;
}

function selectQueues(value: string | undefined) {
  const names = ["control", "github", "sources", "ai", "knowledge", "feedback"] as const;
  if (value === undefined || value === "all") return names;
  if (!names.includes(value as never)) throw new Error(`Unknown queue: ${value}`);
  return [value as (typeof names)[number]];
}

function kindForJob(jobName: string) {
  if (jobName === "contribution.process") return "contribution" as const;
  if (jobName === "outcomes.aggregate") return "outcome" as const;
  if (jobName.startsWith("source.")) return "source_sync" as const;
  if (jobName.startsWith("maintenance.")) return "maintenance" as const;
  return "reprocess" as const;
}

function requireFlag(argv: readonly string[], flag: string): string {
  const value = optionalFlag(argv, flag);
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

function optionalFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function parseOptions(raw: string): Readonly<Record<string, unknown>> {
  const value: unknown = JSON.parse(raw);
  if (value === null || Array.isArray(value) || typeof value !== "object")
    throw new Error("--options-json must be a JSON object");
  return value as Readonly<Record<string, unknown>>;
}

async function waitForShutdown(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

function createShutdownSignal(): { readonly signal: AbortSignal; readonly dispose: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  return {
    signal: controller.signal,
    dispose: () => {
      process.removeListener("SIGINT", abort);
      process.removeListener("SIGTERM", abort);
    },
  };
}
