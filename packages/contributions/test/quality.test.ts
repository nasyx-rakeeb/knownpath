import assert from "node:assert/strict";
import test from "node:test";

import {
  agentContributionV2Schema,
  contributionSubmissionRequestSchema,
  createAgentContributionId,
  createApiKeyId,
  createUserId,
  createVersionedKey,
} from "@knownpath/domain";

import { assessContributionQuality, sanitizeContributionPayload } from "../src/index.js";

const userId = createUserId();

function contribution(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-09-05T00:00:00.000Z");
  return agentContributionV2Schema.parse({
    _id: createAgentContributionId(),
    schemaVersion: 2,
    contractVersion: 2,
    clientSubmissionId: crypto.randomUUID(),
    contributor: {
      userId,
      apiKeyId: createApiKeyId(),
      channel: "agent_api",
      agentClient: { name: "test-agent" },
    },
    kind: "new_lesson",
    relationship: "novel",
    duplicateCheck: { status: "performed", searchId: crypto.randomUUID() },
    deduplicationKey: createVersionedKey([crypto.randomUUID()]),
    originalRequestDigest: { value: "a".repeat(64), version: 1 },
    sanitizedContentDigest: "b".repeat(64),
    payload: {
      problem: "Expo Android release builds fail after upgrading the Gradle plugin",
      ecosystem: "expo",
      packages: [{ ecosystem: "npm", name: "expo", version: "55" }],
      platforms: ["android"],
      versions: ["Expo SDK 55"],
      toolchain: ["Gradle"],
      symptoms: ["Release build fails during Android dependency resolution"],
      errors: ["Could not resolve com.android.tools.build:gradle"],
      rootCause: "The project pins a Gradle plugin version incompatible with the SDK template.",
      solutionSummary: "Align the Android Gradle plugin with the Expo SDK template version.",
      steps: [
        {
          instruction: "Update the Gradle plugin to the version used by the SDK template.",
          verification: "Run an Android release build.",
        },
      ],
      caveats: ["Compare native changes before overwriting customized Gradle configuration."],
      successEvidence: {
        summary: "The Android release build completed successfully.",
        checks: ["Gradle release task exited successfully"],
      },
      verificationType: "build",
      applicability: {
        appliesWhen: "Expo SDK 55 Android projects with a mismatched Gradle plugin",
        doesNotApplyWhen: [],
      },
      environment: { frameworks: ["Expo"], operatingSystems: ["Android"] },
      consultedKnownPaths: [],
    },
    consent: {
      policyIdentifier: "knownpath-contribution-consent",
      policyVersion: 1,
      intent: "public_submission_and_future_publication",
      confirmedAt: now,
      confirmedByUserId: userId,
      visibility: "public",
    },
    sanitization: {
      sanitizerIdentifier: "knownpath-contribution-sanitizer",
      sanitizerVersion: 2,
      secretScanner: { identifier: "secretlint-recommended", version: "13.0.4" },
      status: "clean",
      findings: [],
      originalCharacters: 1,
      sanitizedCharacters: 1,
      redactedCharacters: 0,
      reasonCodes: [],
    },
    status: "pending",
    trustState: "self_reported_unverified",
    processing: { stage: "stored" },
    visibility: { scope: "public" },
    moderation: { status: "unreviewed" },
    audit: { createdAt: now, updatedAt: now, createdByUserId: userId },
    ...overrides,
  });
}

test("quality assessment accepts a specific reusable verified lesson", () => {
  const result = assessContributionQuality(contribution());
  assert.equal(result.decision, "eligible");
  assert.equal(result.signals.hasObservableVerification, true);
});

test("quality assessment rejects a trivial repository-local fix", () => {
  const base = contribution();
  const result = assessContributionQuality(
    contribution({
      payload: {
        ...base.payload,
        problem: "This repo failed because of a missing semicolon in src/local.ts",
        solutionSummary: "Add the missing semicolon to this project file and retry the command.",
      },
    }),
  );
  assert.equal(result.decision, "rejected");
  assert.ok(result.reasonCodes.includes("trivial_or_local_fix"));
  assert.ok(result.reasonCodes.includes("project_specific_context"));
});

test("contract v2 requires consent, applicability, relationship, and duplicate search", () => {
  const base = contribution();
  const result = contributionSubmissionRequestSchema.safeParse({
    contractVersion: 2,
    clientSubmissionId: crypto.randomUUID(),
    kind: "new_lesson",
    visibility: "public",
    consent: { policyVersion: 1, confirmed: false },
    agentClient: { name: "test-agent" },
    payload: { ...base.payload, applicability: undefined },
  });
  assert.equal(result.success, false);
});

test("contract v2 rejects an unavailable duplicate search", () => {
  const base = contribution();
  const result = contributionSubmissionRequestSchema.safeParse({
    contractVersion: 2,
    clientSubmissionId: crypto.randomUUID(),
    kind: "new_lesson",
    relationship: "novel",
    duplicateCheck: { status: "unavailable" },
    visibility: "public",
    consent: { policyVersion: 1, confirmed: true },
    agentClient: { name: "test-agent" },
    payload: base.payload,
  });
  assert.equal(result.success, false);
});

test("sanitizer removes internal hosts, repository URLs, emails, and home usernames", async () => {
  const base = contribution();
  const sanitized = await sanitizeContributionPayload({
    ...base.payload,
    caveats: [
      "Contact developer@example.com from /Users/alice/project and inspect api.example.internal or https://github.com/acme/private-repo",
    ],
  });
  const text = JSON.stringify(sanitized.payload);
  assert.doesNotMatch(
    text,
    /developer@example\.com|\/Users\/alice|example\.internal|acme\/private-repo/u,
  );
  assert.ok(
    sanitized.report.findings.some((finding) => finding.category === "internal_identifier"),
  );
  assert.ok(
    sanitized.report.findings.some((finding) => finding.category === "repository_identifier"),
  );
});
