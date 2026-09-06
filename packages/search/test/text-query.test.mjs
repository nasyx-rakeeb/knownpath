import assert from "node:assert/strict";
import test from "node:test";
import { matchesEmbeddedDiagnostic, normalizeRetrievalQuery } from "../dist/normalization.js";
import { RetrievalService } from "../dist/service.js";

const error = "Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>'.";
const task =
  "Next.js 16 build fails Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>' cookies() async";
const id = "413720f1-1473-46db-aeec-867ba1b10ccc";
const document = {
  _id: id,
  knownPathId: id,
  title: "Async request API build failure",
  problemSummary: "Synchronous cookie access fails TypeScript checking",
  solutions: ["Await cookies() in the server component"],
  knownPathStatus: "published",
  moderationStatus: "approved",
  conflictCount: 0,
  normalizedErrors: [error.toLowerCase()],
  errorCodes: [],
  ecosystem: "next-js",
  packages: ["next"],
  platforms: ["web"],
  environmentTokens: [],
  versionConstraints: [{ subject: "next", value: "16.3.4" }],
  trust: { score: 29, grade: "low", assessmentIds: [id] },
  freshness: { status: "current" },
  outcome: { status: "unobserved" },
};

function service(backend = "local") {
  const database = {
    repositories: {
      knownPathSearchDocuments: {
        exactCandidates: async (query) => {
          assert.deepEqual(query.access, { scope: "public" });
          assert.deepEqual(query.statuses, ["published"]);
          return [];
        },
        localTextSearch: async () => [{ document, score: 1 }],
        atlasTextSearch: async () => [{ document, score: 1 }],
      },
    },
  };
  return new RetrievalService(database, {
    backend,
    candidatePoolMultiplier: 5,
    atlasLexicalIndex: "lexical",
    atlasVectorIndex: "vector",
    dimensions: 768,
    modelIdentifier: "unused",
    modelVersion: "1",
  });
}

for (const backend of ["local", "atlas"]) {
  test(`${backend}: actual OpenCode task clears the unchanged cutoff without embeddings`, async () => {
    const response = await service(backend).search({ text: task, semanticMode: "disabled" });
    assert.equal(response.results.length, 1);
    const result = response.results[0];
    assert.equal(result.knownPathId, id);
    assert.equal(result.score.finalScore, 42);
    assert.equal(result.score.components.exactError, 20);
    assert.equal(result.score.components.trust, 2);
    assert.equal(result.score.versionCompatibility, "unknown");
    assert.equal(result.score.policyVersion, 3);
    assert.ok(result.matchedBy.includes("exact"));
  });
}

test("incompatible explicit version still fails the default cutoff", async () => {
  assert.equal(
    (
      await service().search({
        text: task,
        versions: [{ subject: "next", value: "14.2.0" }],
        semanticMode: "disabled",
      })
    ).results.length,
    0,
  );
});

test("generic lexical similarity alone does not acquire exact credit", async () => {
  assert.equal(
    (await service().search({ text: "Next.js build failure", semanticMode: "disabled" })).results
      .length,
    0,
  );
});

test("complete diagnostics tolerate surrounding prose and terminal punctuation", () => {
  assert.equal(matchesEmbeddedDiagnostic(task, error), true);
  assert.equal(matchesEmbeddedDiagnostic(`Build says: ${error} Please fix.`, error), true);
});

test("different types, property names, partial errors and generic prose do not match", () => {
  for (const input of [
    task.replace("'get'", "'set'"),
    task.replace("ReadonlyRequestCookies", "ReadonlyHeaders"),
    "Property 'get' does not exist",
    `prefix${error}suffix`,
  ])
    assert.equal(matchesEmbeddedDiagnostic(input, error), false);
  assert.equal(matchesEmbeddedDiagnostic("Build failed", "Build failed"), false);
  assert.equal(
    matchesEmbeddedDiagnostic(
      "A long generic problem that cannot be resolved",
      "A long generic problem that cannot be resolved",
    ),
    false,
  );
});

test("error codes in task text reach indexed exact candidate retrieval", () => {
  const normalized = normalizeRetrievalQuery({
    text: "Build fails TS2339 with ERR_MODULE_NOT_FOUND",
    errors: [],
    packages: [],
    platforms: [],
    environment: [],
  });
  assert.deepEqual(normalized.errorCodes, ["ts2339", "err_module_not_found"]);
});
