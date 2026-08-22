import { fileURLToPath } from "node:url";

import {
  loadAiExtractionConfig,
  loadGitHubConfig,
  loadEmbeddingConfig,
  loadMongoConfig,
  loadSearchConfig,
  loadSourceIngestionConfig,
  type LogLevel,
} from "@knownpath/config";
import {
  CandidateDiscoveryService,
  CandidateEmbeddingService,
  CandidatePairService,
  CanonicalRecordService,
  SimilarityProfileService,
  canonicalizationUsage,
  inspectCanonicalizationHistory,
  inspectPair,
  parseCanonicalizationArgs,
} from "@knownpath/canonicalization";
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
import {
  CandidateAssessmentService,
  inspectAssessment,
  inspectAssessmentHistory,
  loadScoringPolicy,
  parseScoringArgs,
  runAssessmentBatch,
  scoringUsage,
} from "@knownpath/verification";
import {
  GeminiEmbeddingProvider,
  RetrievalService,
  SearchProjectionService,
  createAtlasSearchIndexDefinitions,
  createAtlasSearchIndexes,
  inspectAtlasSearchIndexes,
  parseSearchArgs,
  searchUsage,
} from "@knownpath/search";

const command = process.argv[2];

async function main(): Promise<void> {
  if (command === "github") return runGitHub();
  if (command === "sources") return runOfficialSources();
  if (command === "extract") return runExtraction();
  if (command === "score") return runScoring();
  if (command === "canonicalize") return runCanonicalization();
  if (command === "search") return runSearch();
  console.info(
    `${githubIngestionUsage()}\n\n${sourceIngestionUsage()}\n\n${extractionUsage()}\n\n${scoringUsage()}\n\n${canonicalizationUsage()}\n\n${searchUsage()}`,
  );
}

async function runSearch(): Promise<void> {
  const searchConfig = loadSearchConfig();
  const embeddingConfig = loadEmbeddingConfig();
  const request = parseSearchArgs(process.argv.slice(3), {
    limit: searchConfig.defaultLimit,
    minimumScore: searchConfig.minimumScore,
  });
  const database = await connectToMongo(loadMongoConfig());
  const providerFactory =
    embeddingConfig.geminiApiKey === undefined
      ? undefined
      : () =>
          new GeminiEmbeddingProvider({
            apiKey: embeddingConfig.geminiApiKey ?? "",
            modelIdentifier: embeddingConfig.model,
            modelVersion: embeddingConfig.modelVersion,
            requestTimeoutMs: embeddingConfig.requestTimeoutMs,
          });
  try {
    if (request.action === "indexes") {
      const names = {
        lexical: searchConfig.atlasLexicalIndex,
        vector: searchConfig.atlasVectorIndex,
      };
      if (request.operation === "print") {
        console.info(
          JSON.stringify(
            {
              collection: "known_path_search_documents",
              indexes: createAtlasSearchIndexDefinitions(names, embeddingConfig.dimensions),
            },
            null,
            2,
          ),
        );
        return;
      }
      if (searchConfig.backend !== "atlas")
        throw Object.assign(
          new Error("SEARCH_BACKEND=atlas is required for Atlas search-index operations"),
          { code: "atlas_search_not_enabled" },
        );
      if (request.operation === "create") {
        console.info(
          JSON.stringify(
            await createAtlasSearchIndexes(
              database,
              names,
              embeddingConfig.dimensions,
              searchConfig.indexReadyTimeoutMs,
            ),
            null,
            2,
          ),
        );
        return;
      }
      console.info(JSON.stringify({ indexes: await inspectAtlasSearchIndexes(database) }, null, 2));
      return;
    }
    const projections = new SearchProjectionService(database, {
      dimensions: embeddingConfig.dimensions,
      providerCapability: "public_only",
      providerIdentifier: embeddingConfig.provider,
      providerModel: embeddingConfig.model,
      providerModelVersion: embeddingConfig.modelVersion,
      ...(providerFactory === undefined ? {} : { providerFactory }),
    });
    if (request.action === "project" || request.action === "reembed") {
      if (request.action === "reembed" && providerFactory === undefined)
        throw Object.assign(
          new Error("GEMINI_API_KEY is required to re-embed KnownPath search documents"),
          { code: "embedding_provider_not_configured" },
        );
      const useEmbedding = request.action === "reembed" ? true : request.useEmbedding;
      const results =
        request.knownPathId === undefined
          ? await projections.projectPending(request.limit, useEmbedding)
          : [await projections.project(request.knownPathId, useEmbedding)];
      console.info(
        JSON.stringify(
          {
            projected: results.length,
            providerCalls: results.filter((entry) => entry.providerCalled).length,
            documents: results.map((entry) => ({
              id: entry.document._id,
              knownPathId: entry.document.knownPathId,
              revisionId: entry.document.knownPathRevisionId,
              embeddingStatus: entry.document.embedding.status,
              model: entry.document.embedding.modelIdentifier,
              dimensions: entry.document.embedding.dimensions,
              reused: entry.reused,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (request.action === "inspect") {
      const document = await database.repositories.knownPathSearchDocuments.findActive(
        request.knownPathId,
        embeddingConfig.model,
        embeddingConfig.modelVersion,
        embeddingConfig.dimensions,
      );
      if (document === null) throw new Error("Active search projection not found");
      console.info(
        JSON.stringify(
          {
            ...document,
            embedding: {
              ...document.embedding,
              values:
                document.embedding.values === undefined
                  ? undefined
                  : `<${document.embedding.values.length} dimensions>`,
            },
          },
          null,
          2,
        ),
      );
      return;
    }
    const service = new RetrievalService(database, {
      backend: searchConfig.backend,
      atlasLexicalIndex: searchConfig.atlasLexicalIndex,
      atlasVectorIndex: searchConfig.atlasVectorIndex,
      candidatePoolMultiplier: searchConfig.candidatePoolMultiplier,
      dimensions: embeddingConfig.dimensions,
      modelIdentifier: embeddingConfig.model,
      modelVersion: embeddingConfig.modelVersion,
      ...(providerFactory === undefined ? {} : { providerFactory }),
    });
    console.info(JSON.stringify(await service.search(request.query), null, 2));
  } finally {
    await database.close();
  }
}

async function runCanonicalization(): Promise<void> {
  const request = parseCanonicalizationArgs(process.argv.slice(3));
  const database = await connectToMongo(loadMongoConfig());
  try {
    const profiles = new SimilarityProfileService(database);
    const records = new CanonicalRecordService(database);
    if (request.action === "history") {
      console.info(await inspectCanonicalizationHistory(database, request.operationId));
      return;
    }
    if (request.action === "review") {
      if (request.pairAssessmentId !== undefined) {
        console.info(await inspectPair(database, request.pairAssessmentId));
      } else {
        const pairs = await database.repositories.candidatePairAssessments.listForReview(
          request.limit,
        );
        console.info(JSON.stringify({ pairs }, null, 2));
      }
      return;
    }
    if (request.action === "profile") {
      const candidates =
        request.candidateId === undefined
          ? await database.repositories.candidateExperiences.listForCanonicalization(request.limit)
          : [await database.repositories.candidateExperiences.findById(request.candidateId)].filter(
              (candidate) => candidate !== null,
            );
      if (candidates.length === 0) throw new Error("No candidate experiences matched");
      const results = [];
      for (const candidate of candidates) results.push(await profiles.ensure(candidate));
      console.info(
        JSON.stringify(
          {
            profiles: results.map((entry) => ({
              profileId: entry.profile._id,
              candidateExperienceId: entry.profile.candidateExperienceId,
              blockingKeys: entry.profile.blockingKeys.length,
              reused: entry.reused,
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (request.action === "merge") {
      for (const candidateId of request.candidateIds) {
        const candidate = await database.repositories.candidateExperiences.findById(candidateId);
        if (candidate === null) throw new Error(`Candidate ${candidateId} does not exist`);
        await profiles.ensure(candidate);
      }
      const result = await records.mergeCandidates(request);
      console.info(
        JSON.stringify({
          knownPathId: result.knownPath._id,
          latestRevisionId: result.knownPath.latestRevisionId,
          operationId: result.operationId,
        }),
      );
      return;
    }
    if (request.action === "split") {
      const result = await records.splitCandidate(request);
      console.info(
        JSON.stringify({ knownPathId: result.knownPath._id, operationId: result.operationId }),
      );
      return;
    }
    if (request.action === "reassign") {
      const result = await records.reassignCandidate(request);
      console.info(
        JSON.stringify({ knownPathId: result.knownPath._id, operationId: result.operationId }),
      );
      return;
    }
    if (request.action === "rebuild") {
      const knownPath = await records.rebuild(
        request.knownPathId,
        request.operationId,
        request.reason,
      );
      console.info(
        JSON.stringify({
          knownPathId: knownPath._id,
          latestRevisionId: knownPath.latestRevisionId,
        }),
      );
      return;
    }
    const embeddingConfig = loadEmbeddingConfig();
    const embeddings = request.useEmbeddings
      ? new CandidateEmbeddingService(database, {
          dimensions: embeddingConfig.dimensions,
          maxProviderCalls: embeddingConfig.maxProviderCalls,
          maxRetries: embeddingConfig.maxRetries,
          minRequestSpacingMs: embeddingConfig.minRequestSpacingMs,
          providerCapability: "public_only",
          providerIdentifier: embeddingConfig.provider,
          providerModel: embeddingConfig.model,
          providerModelVersion: embeddingConfig.modelVersion,
          providerFactory: () =>
            new GeminiEmbeddingProvider({
              apiKey: embeddingConfig.geminiApiKey ?? "",
              modelIdentifier: embeddingConfig.model,
              modelVersion: embeddingConfig.modelVersion,
              requestTimeoutMs: embeddingConfig.requestTimeoutMs,
            }),
        })
      : undefined;
    const pairs = new CandidatePairService(database, embeddings);
    const discovery = new CandidateDiscoveryService(database, profiles, pairs);
    const summary = await discovery.discover(request.limit, request.useEmbeddings);
    const output: Record<string, unknown> = {
      candidates: summary.candidates,
      profilesCreated: summary.profilesCreated,
      profilesReused: summary.profilesReused,
      pairAssessmentsCreated: summary.pairAssessmentsCreated,
      pairAssessmentsReused: summary.pairAssessmentsReused,
      decisions: summary.pairs.map((pair) => ({
        id: pair._id,
        candidateIds: pair.candidateIds,
        decision: pair.decision,
        semanticSimilarity: pair.semantic.cosineSimilarity ?? null,
      })),
    };
    if (request.action === "auto-merge") {
      const eligible = summary.pairs.filter((pair) => pair.decision === "auto_merge");
      output["dryRun"] = !request.apply;
      output["eligibleAutomaticMerges"] = eligible.length;
      if (request.apply) {
        const merged = [];
        const skipped = [];
        for (const pair of eligible) {
          try {
            const result = await records.mergeCandidates({
              candidateIds: pair.candidateIds,
              reason: "phase8_deterministic_auto_merge",
              pairAssessmentId: pair._id,
            });
            merged.push({
              pairAssessmentId: pair._id,
              knownPathId: result.knownPath._id,
              operationId: result.operationId,
            });
          } catch (error) {
            skipped.push({
              pairAssessmentId: pair._id,
              reason: error instanceof Error ? error.message : "merge failed",
            });
          }
        }
        output["merged"] = merged;
        output["skipped"] = skipped;
      }
    }
    console.info(JSON.stringify(output, null, 2));
  } finally {
    await database.close();
  }
}

async function runScoring(): Promise<void> {
  const request = parseScoringArgs(process.argv.slice(3));
  const database = await connectToMongo(loadMongoConfig());
  try {
    if (request.action === "inspect") {
      console.info(await inspectAssessment(database, request.assessmentId));
      return;
    }
    if (request.action === "history") {
      console.info(await inspectAssessmentHistory(database, request.candidateId, request.limit));
      return;
    }
    const policy = await loadScoringPolicy(request.policyPath);
    const service = new CandidateAssessmentService(database, policy);
    if (request.action === "one") {
      const result = await service.assess(request.candidateId, {
        evaluatedAt: request.evaluatedAt,
        force: request.force,
      });
      console.info(
        JSON.stringify({
          assessmentId: result.assessment._id,
          candidateExperienceId: result.assessment.candidateExperienceId,
          score: result.assessment.finalScore.score,
          grade: result.assessment.finalScore.grade,
          status: result.assessment.status,
          reused: result.reused,
        }),
      );
      return;
    }
    const summary = await runAssessmentBatch(database, service, request);
    console.info(
      JSON.stringify({
        assessed: summary.assessments.length,
        created: summary.created,
        reused: summary.reused,
        assessments: summary.assessments.map((assessment) => ({
          assessmentId: assessment._id,
          candidateExperienceId: assessment.candidateExperienceId,
          score: assessment.finalScore.score,
          grade: assessment.finalScore.grade,
          status: assessment.status,
        })),
      }),
    );
  } finally {
    await database.close();
  }
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
