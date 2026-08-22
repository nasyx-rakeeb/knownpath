import { fileURLToPath } from "node:url";

import {
  loadAiExtractionConfig,
  loadGitHubConfig,
  loadMongoConfig,
  loadSourceIngestionConfig,
  type LogLevel,
} from "@knownpath/config";
import { connectToMongo } from "@knownpath/database";
import {
  ExtractionBatchRunner,
  ExtractionService,
  GeminiExtractionProvider,
  extractionUsage,
  inspectAttempt,
  inspectCandidate,
  parseExtractionArgs,
} from "@knownpath/ai";
import {
  GitHubIngestionService,
  githubIngestionUsage,
  parseGitHubIngestionArgs,
  type GitHubIngestionLogger,
} from "@knownpath/github-ingestion";
import {
  OfficialSourceIngestionService,
  parseSourceIngestionArgs,
  sourceIngestionUsage,
} from "@knownpath/source-ingestion";

const command = process.argv[2];

async function main(): Promise<void> {
  if (command === "github") return runGitHub();
  if (command === "sources") return runOfficialSources();
  if (command === "extract") return runExtraction();
  console.info(`${githubIngestionUsage()}\n\n${sourceIngestionUsage()}\n\n${extractionUsage()}`);
}

async function runExtraction(): Promise<void> {
  const request = parseExtractionArgs(process.argv.slice(3));
  const database = await connectToMongo(loadMongoConfig());
  try {
    if (request.action === "inspect") {
      const output =
        "candidateId" in request
          ? await inspectCandidate(database, request.candidateId)
          : await inspectAttempt(database, request.attemptId);
      console.info(output);
      return;
    }
    const config = loadAiExtractionConfig();
    const service = new ExtractionService(database, {
      dataHandling: config.dataHandling,
      maxEstimatedInputTokens: config.maxEstimatedInputTokens,
      maxOutputTokens: config.maxOutputTokens,
      maxRetries: config.maxRetries,
      model: config.model,
      providerCapability: "public_only",
      providerIdentifier: config.provider,
      providerFactory: () =>
        new GeminiExtractionProvider({
          apiKey: config.geminiApiKey ?? "",
          model: config.model,
          requestTimeoutMs: config.requestTimeoutMs,
        }),
    });
    const runner = new ExtractionBatchRunner(database, service, {
      maxActualTotalTokens: config.maxActualTotalTokens,
      maxEstimatedInputTokens: config.maxEstimatedInputTokens,
      maxProviderCalls: config.maxProviderCalls,
      maxTargets: config.maxTargets,
      minRequestSpacingMs: config.minRequestSpacingMs,
    });
    const summary = await runner.run(request);
    createLogger("info").info("KnownPath extraction command completed", {
      attempts: summary.attempts.map((attempt) => ({
        attemptId: attempt._id,
        status: attempt.status,
        candidateExperienceId: attempt.candidateExperienceId ?? null,
        failureCode: attempt.failureCode ?? null,
      })),
      estimatedInputTokens: summary.estimatedInputTokens,
      providerCalls: summary.providerCalls,
      reused: summary.reused,
      totalTokens: summary.totalTokens,
    });
    const failure = summary.attempts.find((attempt) => attempt.status === "failed");
    if (failure !== undefined) {
      const error = new Error(failure.failureMessage ?? "Extraction failed") as Error & {
        code: string;
      };
      error.code = failure.failureCode ?? "extraction_failed";
      throw error;
    }
  } finally {
    await database.close();
  }
}

async function runGitHub(): Promise<void> {
  const request = parseGitHubIngestionArgs(process.argv.slice(3));
  const githubConfig = loadGitHubConfig({
    ...process.env,
    SOURCE_REGISTRY_PATH:
      process.env["SOURCE_REGISTRY_PATH"] ??
      fileURLToPath(new URL("../../../config/sources/registry.json", import.meta.url)),
  });
  const logger = createLogger(githubConfig.logLevel);
  const mongoConfig = loadMongoConfig();
  const database = await connectToMongo(mongoConfig);
  const controller = new AbortController();
  const abort = (signal: NodeJS.Signals): void => {
    logger.warn("KnownPath GitHub ingestion stopping", { signal });
    controller.abort(new Error(`Interrupted by ${signal}`));
  };
  process.once("SIGINT", () => abort("SIGINT"));
  process.once("SIGTERM", () => abort("SIGTERM"));

  try {
    const service = new GitHubIngestionService(database, githubConfig, logger, controller.signal);
    const results = await service.run(request);
    logger.info("KnownPath GitHub command completed", {
      dryRun: request.dryRun,
      sources: results.map((result) => ({
        source: result.source.key,
        repository: result.source.repository,
        counters: result.counters,
      })),
    });
  } finally {
    await database.close();
  }
}

async function runOfficialSources(): Promise<void> {
  const request = parseSourceIngestionArgs(process.argv.slice(3));
  const sourceConfig = loadSourceIngestionConfig({
    ...process.env,
    SOURCE_REGISTRY_PATH:
      process.env["SOURCE_REGISTRY_PATH"] ??
      fileURLToPath(new URL("../../../config/sources/registry.json", import.meta.url)),
  });
  const logger = createLogger(sourceConfig.logLevel);
  const database = await connectToMongo(loadMongoConfig());
  const controller = new AbortController();
  const abort = (signal: NodeJS.Signals): void => {
    logger.warn("KnownPath official source ingestion stopping", { signal });
    controller.abort(new Error(`Interrupted by ${signal}`));
  };
  process.once("SIGINT", () => abort("SIGINT"));
  process.once("SIGTERM", () => abort("SIGTERM"));

  try {
    const service = new OfficialSourceIngestionService(
      database,
      sourceConfig,
      logger,
      controller.signal,
    );
    const results = await service.run(request);
    logger.info("KnownPath official source command completed", {
      action: request.action,
      dryRun: request.dryRun,
      sources: results.map((result) => ({
        source: result.source.key,
        adapter: result.source.adapter,
        counters: result.counters,
      })),
    });
  } finally {
    await database.close();
  }
}

function createLogger(configuredLevel: LogLevel): GitHubIngestionLogger {
  return {
    debug: (message, context) => writeLog(configuredLevel, "debug", message, context),
    error: (message, context) => writeLog(configuredLevel, "error", message, context),
    info: (message, context) => writeLog(configuredLevel, "info", message, context),
    warn: (message, context) => writeLog(configuredLevel, "warn", message, context),
  };
}

function writeLog(
  configuredLevel: LogLevel,
  level: "debug" | "error" | "info" | "warn",
  message: string,
  context?: Readonly<Record<string, unknown>>,
): void {
  const priorities: Readonly<Record<LogLevel, number>> = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
    silent: -1,
  };
  if (configuredLevel === "silent" || priorities[level] > priorities[configuredLevel]) return;

  const output = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context === undefined ? {} : context),
  });
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

main().catch((error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { readonly code: unknown }).code)
      : "worker_failed";
  const message = error instanceof Error ? error.message : "Worker command failed";
  createLogger("error").error("KnownPath worker failed", { code, message });
  process.exitCode = 1;
});
