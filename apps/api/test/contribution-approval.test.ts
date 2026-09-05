import assert from "node:assert/strict";
import test from "node:test";

import type { KnownPathDatabase } from "@knownpath/database";
import {
  agentContributionV2Schema,
  createAgentContributionId,
  createCandidateExperienceId,
  createPipelineRunId,
  createPipelineStepId,
  createUserId,
  createVersionedKey,
} from "@knownpath/domain";
import type { JobProducer } from "@knownpath/jobs";

import { AdminService } from "../src/admin-service.js";

test("approval schedules canonicalization once and repeated approval reuses it", async () => {
  const userId = createUserId();
  const candidateId = createCandidateExperienceId();
  const contribution = agentContributionV2Schema.parse({
    _id: createAgentContributionId(),
    schemaVersion: 2,
    contractVersion: 2,
    clientSubmissionId: crypto.randomUUID(),
    contributor: { userId, channel: "agent_api", agentClient: { name: "test" } },
    kind: "new_lesson",
    relationship: "novel",
    duplicateCheck: { status: "performed", searchId: crypto.randomUUID() },
    deduplicationKey: createVersionedKey(["approval-test"]),
    originalRequestDigest: { value: "a".repeat(64), version: 1 },
    sanitizedContentDigest: "b".repeat(64),
    payload: {
      problem: "A sufficiently specific technical problem for approval",
      ecosystem: "expo",
      packages: [],
      platforms: ["android"],
      versions: [],
      toolchain: [],
      symptoms: ["Build fails reproducibly"],
      errors: [],
      solutionSummary: "Apply the compatible configuration and rebuild the application.",
      steps: [{ instruction: "Apply the compatible configuration." }],
      caveats: [],
      successEvidence: { summary: "Build succeeded", checks: ["Build exited zero"] },
      verificationType: "build",
      applicability: { appliesWhen: "Expo Android builds", doesNotApplyWhen: [] },
      environment: {},
      consultedKnownPaths: [],
    },
    consent: {
      policyIdentifier: "knownpath-contribution-consent",
      policyVersion: 1,
      intent: "public_submission_and_future_publication",
      confirmedAt: new Date(),
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
    processing: { stage: "awaiting_moderation", candidateExperienceId: candidateId },
    visibility: { scope: "public" },
    moderation: { status: "unreviewed" },
    audit: { createdAt: new Date(), updatedAt: new Date(), createdByUserId: userId },
  });
  let stored = contribution;
  const enqueues: unknown[] = [];
  const db = {
    repositories: {
      agentContributions: {
        findById: async () => stored,
        updateModerationIfCurrent: async (_id: string, expected: string, moderation: unknown) => {
          if (stored.moderation.status !== expected) return null;
          stored = agentContributionV2Schema.parse({
            ...stored,
            status: "accepted",
            moderation,
          });
          return stored;
        },
        updateProcessing: async (_id: string, processing: unknown) => {
          stored = agentContributionV2Schema.parse({ ...stored, processing });
          return stored;
        },
      },
      canonicalMemberships: { findActiveSupportingByCandidate: async () => null },
      contributionQualityAssessments: {
        findLatestByContribution: async () => ({ decision: "eligible" }),
      },
    },
  } as unknown as KnownPathDatabase;
  const producer = {
    enqueue: async (request: unknown) => {
      enqueues.push(request);
      return {
        run: { _id: createPipelineRunId() },
        data: { pipelineStepId: createPipelineStepId() },
        deduplicated: enqueues.length > 1,
      };
    },
  } as unknown as JobProducer;
  const service = new AdminService(db, "x".repeat(32), undefined, producer);
  const request = {
    resource: "contribution" as const,
    id: contribution._id,
    action: "approve" as const,
    expectedStatus: "unreviewed",
    confirmation: { reason: "Reusable verified technical lesson", exact: contribution._id },
  };
  const first = await service.moderate(request, userId);
  assert.equal(first.canonicalization.state, "queued");
  const second = await service.moderate({ ...request, expectedStatus: "approved" }, userId);
  assert.equal(second.canonicalization.state, "already_queued");
  assert.equal(enqueues.length, 2);
  assert.deepEqual(
    (enqueues[0] as { idempotencyParts: string[] }).idempotencyParts,
    (enqueues[1] as { idempotencyParts: string[] }).idempotencyParts,
  );
});
