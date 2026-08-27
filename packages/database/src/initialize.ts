import type { Db, Document, IndexDescription } from "mongodb";

import { collectionNames } from "./collections.js";

interface CollectionDefinition {
  readonly indexes: readonly IndexDescription[];
  readonly name: (typeof collectionNames)[keyof typeof collectionNames];
  readonly obsoleteIndexes?: readonly string[];
  readonly validator: Document;
}

const numericBsonTypes = ["int", "long", "double", "decimal"] as const;

function plainValidator(
  required: readonly string[],
  properties: Readonly<Record<string, Document>>,
): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", ...required],
      properties: {
        _id: { bsonType: "string" },
        ...properties,
      },
    },
  };
}

function envelopeValidator(
  required: readonly string[],
  properties: Readonly<Record<string, Document>>,
): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "schemaVersion", "audit", ...required],
      properties: {
        _id: { bsonType: "string" },
        schemaVersion: { bsonType: numericBsonTypes, enum: [1] },
        audit: {
          bsonType: "object",
          required: ["createdAt", "updatedAt"],
          properties: {
            createdAt: { bsonType: "date" },
            updatedAt: { bsonType: "date" },
          },
        },
        ...properties,
      },
    },
  };
}

export const collectionDefinitions: readonly CollectionDefinition[] = [
  {
    name: collectionNames.pipelineRuns,
    validator: envelopeValidator(["kind", "trigger", "status", "scope", "counters"], {
      kind: { bsonType: "string" },
      trigger: { bsonType: "string" },
      status: { bsonType: "string" },
      scope: { bsonType: "object" },
      counters: { bsonType: "object" },
    }),
    indexes: [
      { key: { status: 1, "audit.updatedAt": 1 }, name: "ix_pipeline_runs_status_updated" },
      { key: { kind: 1, "audit.createdAt": -1 }, name: "ix_pipeline_runs_kind_created" },
      {
        key: { "scope.target.kind": 1, "scope.target.id": 1, "audit.createdAt": -1 },
        name: "ix_pipeline_runs_target_created",
      },
    ],
  },
  {
    name: collectionNames.pipelineSteps,
    validator: envelopeValidator(
      [
        "pipelineRunId",
        "jobName",
        "queueName",
        "target",
        "idempotencyKey",
        "payloadDigest",
        "payload",
        "bullmqJobId",
        "trigger",
        "chainDepth",
        "status",
        "attemptsMade",
        "maxAttempts",
        "processingVersions",
      ],
      {
        pipelineRunId: { bsonType: "string" },
        jobName: { bsonType: "string" },
        queueName: { bsonType: "string" },
        target: { bsonType: "object" },
        idempotencyKey: { bsonType: "object" },
        payloadDigest: { bsonType: "string" },
        payload: { bsonType: "object" },
        bullmqJobId: { bsonType: "string" },
        trigger: { bsonType: "string" },
        chainDepth: { bsonType: numericBsonTypes },
        status: { bsonType: "string" },
        attemptsMade: { bsonType: numericBsonTypes },
        maxAttempts: { bsonType: numericBsonTypes },
        processingVersions: { bsonType: "object" },
      },
    ),
    indexes: [
      { key: { "idempotencyKey.value": 1 }, name: "uq_pipeline_steps_idempotency", unique: true },
      { key: { bullmqJobId: 1 }, name: "uq_pipeline_steps_bullmq_job", unique: true },
      { key: { status: 1, "audit.updatedAt": 1 }, name: "ix_pipeline_steps_status_updated" },
      {
        key: { pipelineRunId: 1, status: 1, "audit.createdAt": 1 },
        name: "ix_pipeline_steps_run_status_created",
      },
      {
        key: { "target.kind": 1, "target.id": 1, jobName: 1, "audit.createdAt": -1 },
        name: "ix_pipeline_steps_target_job_created",
      },
      {
        key: { status: 1, quarantineReason: 1, completedAt: -1 },
        name: "ix_pipeline_steps_quarantine",
      },
    ],
  },
  {
    name: collectionNames.workerHeartbeats,
    validator: envelopeValidator(
      [
        "workerVersion",
        "queues",
        "state",
        "activeJobs",
        "startedAt",
        "lastHeartbeatAt",
        "expiresAt",
      ],
      {
        workerVersion: { bsonType: "string" },
        queues: { bsonType: "array" },
        state: { bsonType: "string" },
        activeJobs: { bsonType: numericBsonTypes },
        startedAt: { bsonType: "date" },
        lastHeartbeatAt: { bsonType: "date" },
        expiresAt: { bsonType: "date" },
      },
    ),
    indexes: [
      { key: { state: 1, lastHeartbeatAt: -1 }, name: "ix_worker_heartbeats_state_time" },
      { key: { expiresAt: 1 }, name: "ttl_worker_heartbeats", expireAfterSeconds: 0 },
    ],
  },
  {
    name: collectionNames.users,
    validator: plainValidator(
      [
        "schemaVersion",
        "email",
        "normalizedEmail",
        "emailVerified",
        "displayName",
        "role",
        "status",
        "createdAt",
        "updatedAt",
      ],
      {
        schemaVersion: { bsonType: numericBsonTypes, enum: [1] },
        email: { bsonType: "string" },
        normalizedEmail: { bsonType: "string" },
        emailVerified: { bsonType: "bool" },
        displayName: { bsonType: "string" },
        role: { enum: ["user", "admin"] },
        status: { enum: ["active", "suspended", "deleted"] },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    ),
    indexes: [
      { key: { email: 1 }, name: "uq_users_email", unique: true },
      { key: { normalizedEmail: 1 }, name: "uq_users_normalized_email", unique: true },
      { key: { status: 1, updatedAt: -1 }, name: "ix_users_status_updated_at_v2" },
    ],
  },
  {
    name: collectionNames.workspaces,
    validator: envelopeValidator(
      ["name", "slug", "status", "ownerUserId", "defaultContributionScope"],
      {
        name: { bsonType: "string" },
        slug: { bsonType: "string" },
        status: { enum: ["active", "archived"] },
        ownerUserId: { bsonType: "string" },
        defaultContributionScope: { enum: ["private", "team"] },
      },
    ),
    indexes: [
      { key: { slug: 1 }, name: "uq_workspaces_slug", unique: true },
      { key: { ownerUserId: 1, status: 1 }, name: "ix_workspaces_owner_status" },
      { key: { status: 1, "audit.updatedAt": -1 }, name: "ix_workspaces_status_updated" },
    ],
  },
  {
    name: collectionNames.workspaceMemberships,
    obsoleteIndexes: ["uq_workspace_memberships_workspace_user"],
    validator: envelopeValidator(["workspaceId", "userId", "role", "status", "joinedAt"], {
      workspaceId: { bsonType: "string" },
      userId: { bsonType: "string" },
      role: { enum: ["owner", "admin", "member"] },
      status: { enum: ["active", "removed"] },
      joinedAt: { bsonType: "date" },
    }),
    indexes: [
      {
        key: { workspaceId: 1, userId: 1 },
        name: "uq_workspace_memberships_active_workspace_user",
        unique: true,
        partialFilterExpression: { status: "active" },
      },
      {
        key: { userId: 1, status: 1, "audit.updatedAt": -1 },
        name: "ix_workspace_memberships_user_status",
      },
      {
        key: { workspaceId: 1, status: 1, role: 1, joinedAt: 1 },
        name: "ix_workspace_memberships_workspace_status_role",
      },
    ],
  },
  {
    name: collectionNames.workspaceInvitations,
    validator: envelopeValidator(
      [
        "workspaceId",
        "inviterUserId",
        "inviteeUserId",
        "invitedEmail",
        "role",
        "status",
        "createdAt",
        "expiresAt",
      ],
      {
        workspaceId: { bsonType: "string" },
        inviterUserId: { bsonType: "string" },
        inviteeUserId: { bsonType: "string" },
        invitedEmail: { bsonType: "string" },
        role: { enum: ["admin", "member"] },
        status: { enum: ["pending", "accepted", "rejected", "revoked", "expired"] },
        createdAt: { bsonType: "date" },
        expiresAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { workspaceId: 1, inviteeUserId: 1, status: 1 },
        name: "uq_workspace_invitations_pending_invitee",
        unique: true,
        partialFilterExpression: { status: "pending" },
      },
      {
        key: { inviteeUserId: 1, status: 1, expiresAt: 1 },
        name: "ix_workspace_invitations_invitee_status_expiry",
      },
      {
        key: { workspaceId: 1, status: 1, createdAt: -1 },
        name: "ix_workspace_invitations_workspace_status_created",
      },
      { key: { status: 1, expiresAt: 1 }, name: "ix_workspace_invitations_expiry" },
    ],
  },
  {
    name: collectionNames.knowledgeShareRequests,
    validator: envelopeValidator(
      [
        "sourceKnownPathId",
        "sourceScope",
        "requestedByUserId",
        "status",
        "publicPayload",
        "sanitization",
        "consent",
      ],
      {
        sourceKnownPathId: { bsonType: "string" },
        sourceScope: { bsonType: "object", required: ["scope"] },
        requestedByUserId: { bsonType: "string" },
        status: { enum: ["draft", "submitted", "quarantined", "rejected"] },
        publicPayload: { bsonType: "object" },
        sanitization: { bsonType: "object" },
        consent: { bsonType: "object" },
      },
    ),
    indexes: [
      {
        key: { sourceKnownPathId: 1, requestedByUserId: 1, "audit.createdAt": -1 },
        name: "ix_knowledge_share_requests_source_user_created",
      },
      {
        key: { "sourceScope.scope": 1, "sourceScope.workspaceId": 1, status: 1 },
        name: "ix_knowledge_share_requests_workspace_status",
        partialFilterExpression: { "sourceScope.scope": "team" },
      },
    ],
  },
  {
    name: collectionNames.apiKeys,
    validator: envelopeValidator(["userId", "keyHash", "status"], {
      userId: { bsonType: "string" },
      keyHash: { bsonType: "string" },
      status: { enum: ["active", "revoked", "expired"] },
    }),
    indexes: [
      { key: { prefix: 1 }, name: "uq_api_keys_prefix", unique: true },
      { key: { keyHash: 1 }, name: "uq_api_keys_key_hash", unique: true },
      {
        key: { userId: 1, status: 1, "audit.createdAt": -1 },
        name: "ix_api_keys_user_status_created_at",
      },
      {
        key: { "binding.workspaceId": 1, status: 1, "audit.createdAt": -1 },
        name: "ix_api_keys_workspace_status_created",
        partialFilterExpression: { "binding.kind": "workspace" },
      },
    ],
  },
  {
    name: collectionNames.auditEvents,
    validator: plainValidator(
      ["schemaVersion", "eventType", "occurredAt", "actor", "target", "outcome"],
      {
        schemaVersion: { bsonType: numericBsonTypes, enum: [1] },
        eventType: { bsonType: "string" },
        occurredAt: { bsonType: "date" },
        actor: { bsonType: "object", required: ["kind"] },
        target: { bsonType: "object", required: ["kind", "id"] },
        outcome: { enum: ["success", "failure"] },
      },
    ),
    indexes: [
      { key: { "actor.userId": 1, occurredAt: -1 }, name: "ix_audit_actor_time" },
      { key: { "target.kind": 1, "target.id": 1, occurredAt: -1 }, name: "ix_audit_target_time" },
      { key: { eventType: 1, occurredAt: -1 }, name: "ix_audit_event_type_time" },
      {
        key: { requestId: 1 },
        name: "ix_audit_request_id",
        partialFilterExpression: { requestId: { $exists: true } },
      },
    ],
  },
  {
    name: collectionNames.authSessions,
    validator: plainValidator(["token", "userId", "expiresAt", "createdAt", "updatedAt"], {
      token: { bsonType: "string" },
      userId: { bsonType: "string" },
      expiresAt: { bsonType: "date" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    }),
    indexes: [
      { key: { token: 1 }, name: "uq_auth_sessions_token", unique: true },
      { key: { userId: 1, expiresAt: -1 }, name: "ix_auth_sessions_user_expires_at" },
      { key: { expiresAt: 1 }, name: "ix_auth_sessions_expires_at" },
    ],
  },
  {
    name: collectionNames.authAccounts,
    obsoleteIndexes: ["uq_auth_accounts_issuer_account"],
    validator: plainValidator(
      ["providerId", "issuer", "accountId", "userId", "createdAt", "updatedAt"],
      {
        providerId: { bsonType: "string" },
        issuer: { bsonType: "string" },
        accountId: { bsonType: "string" },
        userId: { bsonType: "string" },
        createdAt: { bsonType: "date" },
        updatedAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { issuer: 1, accountId: 1 },
        name: "auth_accounts_issuer_accountId_uidx",
        unique: true,
      },
      { key: { userId: 1, providerId: 1 }, name: "ix_auth_accounts_user_provider" },
    ],
  },
  {
    name: collectionNames.authVerifications,
    validator: plainValidator(["identifier", "value", "expiresAt", "createdAt", "updatedAt"], {
      identifier: { bsonType: "string" },
      value: { bsonType: "string" },
      expiresAt: { bsonType: "date" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    }),
    indexes: [
      { key: { identifier: 1 }, name: "ix_auth_verifications_identifier" },
      { key: { expiresAt: 1 }, name: "ix_auth_verifications_expires_at" },
    ],
  },
  {
    name: collectionNames.sourceRegistries,
    obsoleteIndexes: ["ix_source_registries_visibility_team"],
    validator: envelopeValidator(["kind", "identityKey", "enabled", "visibility"], {
      kind: {
        enum: ["github_repository", "documentation_site", "release_feed", "agent_contribution"],
      },
      identityKey: { bsonType: "object", required: ["value", "version"] },
      enabled: { bsonType: "bool" },
      visibility: { bsonType: "object", required: ["scope"] },
    }),
    indexes: [
      { key: { "identityKey.value": 1 }, name: "uq_source_registries_identity_key", unique: true },
      {
        key: { enabled: 1, kind: 1, "audit.updatedAt": -1 },
        name: "ix_source_registries_enabled_kind_updated_at",
      },
      {
        key: { "visibility.scope": 1, "visibility.ownerUserId": 1 },
        name: "ix_source_registries_visibility_owner",
        partialFilterExpression: { "visibility.scope": "private" },
      },
      {
        key: { "visibility.scope": 1, "visibility.workspaceId": 1 },
        name: "ix_source_registries_visibility_workspace",
        partialFilterExpression: { "visibility.scope": "team" },
      },
    ],
  },
  {
    name: collectionNames.sourceItems,
    validator: envelopeValidator(
      ["sourceRegistryId", "deduplicationKey", "capturedAt", "provenance"],
      {
        sourceRegistryId: { bsonType: "string" },
        deduplicationKey: { bsonType: "object", required: ["value", "version"] },
        capturedAt: { bsonType: "date" },
        provenance: { bsonType: "object", required: ["sourceItemIdentity"] },
      },
    ),
    indexes: [
      {
        key: { "deduplicationKey.value": 1 },
        name: "uq_source_items_deduplication_key",
        unique: true,
      },
      {
        key: { sourceRegistryId: 1, capturedAt: -1 },
        name: "ix_source_items_registry_captured_at",
      },
      {
        key: { sourceRegistryId: 1, "provenance.sourceItemIdentity": 1, capturedAt: -1 },
        name: "ix_source_items_registry_identity_captured_at",
      },
      {
        key: {
          sourceRegistryId: 1,
          itemType: 1,
          "provenance.observedAt": -1,
        },
        name: "ix_source_items_registry_type_observed_at",
      },
      {
        key: {
          "sourceQuality.authority": 1,
          "documentMetadata.ecosystem": 1,
          "documentMetadata.documentType": 1,
          capturedAt: -1,
        },
        name: "ix_source_items_authority_ecosystem_document_type_captured_at",
        partialFilterExpression: { documentMetadata: { $exists: true } },
      },
      {
        key: { "documentMetadata.framework": 1, "documentMetadata.versions": 1, capturedAt: -1 },
        name: "ix_source_items_framework_versions_captured_at",
        partialFilterExpression: { documentMetadata: { $exists: true } },
      },
    ],
  },
  {
    name: collectionNames.sourceItemStates,
    validator: envelopeValidator(
      [
        "sourceRegistryId",
        "sourceItemIdentity",
        "canonicalUrl",
        "itemType",
        "lifecycleStatus",
        "lastFetchedAt",
        "lastObservedAt",
      ],
      {
        sourceRegistryId: { bsonType: "string" },
        sourceItemIdentity: { bsonType: "string" },
        canonicalUrl: { bsonType: "string" },
        itemType: { bsonType: "string" },
        lifecycleStatus: { enum: ["active", "deprecated", "deleted"] },
        lastFetchedAt: { bsonType: "date" },
        lastObservedAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { sourceRegistryId: 1, sourceItemIdentity: 1 },
        name: "uq_source_item_states_registry_identity",
        unique: true,
      },
      {
        key: { sourceRegistryId: 1, lifecycleStatus: 1, lastFetchedAt: 1 },
        name: "ix_source_item_states_registry_lifecycle_fetched_at",
      },
      {
        key: {
          sourceRegistryId: 1,
          "documentMetadata.documentType": 1,
          "documentMetadata.versions": 1,
        },
        name: "ix_source_item_states_registry_document_type_versions",
      },
    ],
  },
  {
    name: collectionNames.ingestionRuns,
    validator: envelopeValidator(["sourceRegistryId", "deduplicationKey", "status"], {
      sourceRegistryId: { bsonType: "string" },
      deduplicationKey: { bsonType: "object", required: ["value", "version"] },
      status: { enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
    }),
    indexes: [
      {
        key: { "deduplicationKey.value": 1 },
        name: "uq_ingestion_runs_deduplication_key",
        unique: true,
      },
      {
        key: { status: 1, nextAttemptAt: 1, "audit.createdAt": 1 },
        name: "ix_ingestion_runs_status_next_attempt_created_at",
      },
      {
        key: { sourceRegistryId: 1, "audit.createdAt": -1 },
        name: "ix_ingestion_runs_registry_created_at",
      },
    ],
  },
  {
    name: collectionNames.candidateAssessments,
    validator: envelopeValidator(
      [
        "candidateExperienceId",
        "idempotencyKey",
        "status",
        "algorithm",
        "policy",
        "verifierVersion",
        "evaluatedAt",
        "candidateDigest",
        "inputs",
        "signals",
        "components",
        "finalScore",
      ],
      {
        candidateExperienceId: { bsonType: "string" },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        status: { enum: ["completed", "ineligible"] },
        algorithm: { bsonType: "object", required: ["identifier", "version"] },
        policy: { bsonType: "object", required: ["identifier", "version", "digest"] },
        verifierVersion: { bsonType: numericBsonTypes },
        evaluatedAt: { bsonType: "date" },
        candidateDigest: { bsonType: "string" },
        inputs: { bsonType: "object", required: ["sourceItems"] },
        signals: { bsonType: "array" },
        components: {
          bsonType: "object",
          required: ["sourceEvidence", "freshness", "versionFit", "outcomeConfidence"],
        },
        finalScore: { bsonType: "object", required: ["kind", "score", "grade"] },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_candidate_assessments_idempotency_key",
        unique: true,
      },
      {
        key: { candidateExperienceId: 1, evaluatedAt: -1 },
        name: "ix_candidate_assessments_candidate_evaluated_at",
      },
      {
        key: {
          "algorithm.identifier": 1,
          "algorithm.version": 1,
          "policy.identifier": 1,
          "policy.version": 1,
          evaluatedAt: -1,
        },
        name: "ix_candidate_assessments_algorithm_policy_evaluated_at",
      },
      {
        key: { status: 1, "finalScore.score": -1 },
        name: "ix_candidate_assessments_status_score",
      },
      {
        key: { "inputs.sourceItems.sourceItemId": 1, evaluatedAt: -1 },
        name: "ix_candidate_assessments_source_item_evaluated_at",
      },
    ],
  },
  {
    name: collectionNames.candidateExperiences,
    validator: envelopeValidator(["deduplicationKey", "status", "metadata"], {
      deduplicationKey: { bsonType: "object", required: ["value", "version"] },
      status: { enum: ["pending", "accepted", "rejected", "superseded", "failed"] },
      metadata: { bsonType: "object", required: ["primaryEcosystem"] },
    }),
    indexes: [
      {
        key: { "deduplicationKey.value": 1 },
        name: "uq_candidate_experiences_deduplication_key",
        unique: true,
      },
      {
        key: { status: 1, "audit.createdAt": 1 },
        name: "ix_candidate_experiences_status_created_at",
      },
      {
        key: { "metadata.primaryEcosystem": 1, "metadata.primaryPackageName": 1 },
        name: "ix_candidate_experiences_ecosystem_package",
      },
      { key: { errorFingerprints: 1 }, name: "ix_candidate_experiences_error_fingerprints" },
    ],
  },
  {
    name: collectionNames.candidateSimilarityProfiles,
    validator: envelopeValidator(
      [
        "candidateExperienceId",
        "idempotencyKey",
        "candidateDigest",
        "normalizer",
        "profileVersion",
        "ecosystem",
        "problemSolutionFingerprint",
        "blockingKeys",
        "generatedAt",
      ],
      {
        candidateExperienceId: { bsonType: "string" },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        candidateDigest: { bsonType: "string" },
        normalizer: { bsonType: "object", required: ["identifier", "version"] },
        profileVersion: { bsonType: numericBsonTypes },
        ecosystem: { bsonType: "string" },
        problemSolutionFingerprint: { bsonType: "string" },
        blockingKeys: { bsonType: "array" },
        generatedAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_candidate_similarity_profiles_idempotency_key",
        unique: true,
      },
      {
        key: { candidateExperienceId: 1, "normalizer.version": -1, generatedAt: -1 },
        name: "ix_candidate_similarity_profiles_candidate_normalizer_generated_at",
      },
      {
        key: { "blockingKeys.value": 1, "normalizer.version": 1 },
        name: "ix_candidate_similarity_profiles_blocking_normalizer",
      },
      {
        key: { errorFingerprints: 1, ecosystem: 1 },
        name: "ix_candidate_similarity_profiles_error_ecosystem",
      },
    ],
  },
  {
    name: collectionNames.candidateEmbeddings,
    validator: envelopeValidator(
      [
        "candidateExperienceId",
        "similarityProfileId",
        "idempotencyKey",
        "inputDigest",
        "inputVersion",
        "visibilityScope",
        "provider",
        "modelIdentifier",
        "modelVersion",
        "dimensions",
        "task",
        "values",
        "generatedAt",
        "latencyMs",
      ],
      {
        candidateExperienceId: { bsonType: "string" },
        similarityProfileId: { bsonType: "string" },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        inputDigest: { bsonType: "string" },
        inputVersion: { bsonType: numericBsonTypes },
        visibilityScope: { enum: ["public", "private", "team"] },
        provider: { bsonType: "object", required: ["identifier", "capability"] },
        modelIdentifier: { bsonType: "string" },
        modelVersion: { bsonType: "string" },
        dimensions: { bsonType: numericBsonTypes },
        task: { enum: ["semantic_similarity"] },
        values: { bsonType: "array" },
        generatedAt: { bsonType: "date" },
        latencyMs: { bsonType: numericBsonTypes },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_candidate_embeddings_idempotency_key",
        unique: true,
      },
      {
        key: {
          candidateExperienceId: 1,
          similarityProfileId: 1,
          modelIdentifier: 1,
          dimensions: 1,
          generatedAt: -1,
        },
        name: "ix_candidate_embeddings_candidate_profile_model_generated_at",
      },
      { key: { inputDigest: 1, modelIdentifier: 1 }, name: "ix_candidate_embeddings_input_model" },
    ],
  },
  {
    name: collectionNames.candidatePairAssessments,
    validator: envelopeValidator(
      [
        "candidateIds",
        "profileIds",
        "idempotencyKey",
        "policy",
        "blockingReasons",
        "deterministic",
        "semantic",
        "decision",
        "reasonCodes",
        "explanations",
        "evaluatedAt",
      ],
      {
        candidateIds: { bsonType: "array" },
        profileIds: { bsonType: "array" },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        policy: { bsonType: "object", required: ["identifier", "version", "digest"] },
        blockingReasons: { bsonType: "array" },
        deterministic: { bsonType: "object" },
        semantic: { bsonType: "object", required: ["status"] },
        decision: { enum: ["auto_merge", "review", "separate"] },
        reasonCodes: { bsonType: "array" },
        explanations: { bsonType: "array" },
        evaluatedAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_candidate_pair_assessments_idempotency_key",
        unique: true,
      },
      {
        key: { "candidateIds.0": 1, "candidateIds.1": 1, "policy.version": 1, evaluatedAt: -1 },
        name: "ix_candidate_pair_assessments_pair_policy_evaluated_at",
      },
      {
        key: { decision: 1, "semantic.cosineSimilarity": -1, evaluatedAt: -1 },
        name: "ix_candidate_pair_assessments_decision_semantic_evaluated_at",
      },
      {
        key: { candidateIds: 1, evaluatedAt: -1 },
        name: "ix_candidate_pair_assessments_candidates",
      },
    ],
  },
  {
    name: collectionNames.canonicalMemberships,
    obsoleteIndexes: ["uq_canonical_memberships_relationship"],
    validator: envelopeValidator(
      [
        "knownPathId",
        "candidateExperienceId",
        "disposition",
        "active",
        "reasonCode",
        "operationId",
        "assignedAt",
      ],
      {
        knownPathId: { bsonType: "string" },
        candidateExperienceId: { bsonType: "string" },
        disposition: { enum: ["supporting", "conflicting", "rejected"] },
        active: { bsonType: "bool" },
        reasonCode: { bsonType: "string" },
        operationId: { bsonType: "string" },
        assignedAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { knownPathId: 1, candidateExperienceId: 1, disposition: 1, active: 1 },
        name: "ix_canonical_memberships_relationship",
      },
      {
        key: { candidateExperienceId: 1 },
        name: "uq_canonical_memberships_active_supporting_candidate",
        unique: true,
        partialFilterExpression: { disposition: "supporting", active: true },
      },
      {
        key: { knownPathId: 1, active: 1, disposition: 1, "solutionKey.value": 1 },
        name: "ix_canonical_memberships_known_path_active_disposition_solution",
      },
      {
        key: { candidateExperienceId: 1, active: 1, disposition: 1 },
        name: "ix_canonical_memberships_candidate_active_disposition",
      },
      { key: { operationId: 1 }, name: "ix_canonical_memberships_operation" },
    ],
  },
  {
    name: collectionNames.canonicalizationEvents,
    validator: envelopeValidator(
      [
        "idempotencyKey",
        "operationId",
        "sequence",
        "eventType",
        "actor",
        "reason",
        "knownPathIds",
        "candidateExperienceIds",
        "membershipIds",
        "facts",
        "occurredAt",
      ],
      {
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        operationId: { bsonType: "string" },
        sequence: { bsonType: numericBsonTypes },
        eventType: { bsonType: "string" },
        actor: { bsonType: "object", required: ["kind"] },
        reason: { bsonType: "string" },
        knownPathIds: { bsonType: "array" },
        candidateExperienceIds: { bsonType: "array" },
        membershipIds: { bsonType: "array" },
        facts: { bsonType: "object" },
        occurredAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_canonicalization_events_idempotency_key",
        unique: true,
      },
      {
        key: { operationId: 1, sequence: 1 },
        name: "uq_canonicalization_events_operation_sequence",
        unique: true,
      },
      {
        key: { knownPathIds: 1, occurredAt: -1 },
        name: "ix_canonicalization_events_known_path_time",
      },
      {
        key: { candidateExperienceIds: 1, occurredAt: -1 },
        name: "ix_canonicalization_events_candidate_time",
      },
      { key: { eventType: 1, occurredAt: -1 }, name: "ix_canonicalization_events_type_time" },
    ],
  },
  {
    name: collectionNames.knownPathRevisions,
    validator: envelopeValidator(
      [
        "knownPathId",
        "revisionNumber",
        "idempotencyKey",
        "builder",
        "snapshotDigest",
        "membershipIds",
        "candidateExperienceIds",
        "assessmentIds",
        "title",
        "problemSummary",
        "metadata",
        "solutionVariants",
        "evidence",
        "trust",
        "freshness",
        "membershipSummary",
        "createdAt",
      ],
      {
        knownPathId: { bsonType: "string" },
        revisionNumber: { bsonType: numericBsonTypes },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        builder: { bsonType: "object", required: ["identifier", "version"] },
        snapshotDigest: { bsonType: "string" },
        membershipIds: { bsonType: "array" },
        candidateExperienceIds: { bsonType: "array" },
        assessmentIds: { bsonType: "array" },
        title: { bsonType: "string" },
        problemSummary: { bsonType: "string" },
        metadata: { bsonType: "object" },
        solutionVariants: { bsonType: "array" },
        evidence: { bsonType: "array" },
        trust: { bsonType: "object" },
        freshness: { bsonType: "object" },
        membershipSummary: { bsonType: "object" },
        createdAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_known_path_revisions_idempotency_key",
        unique: true,
      },
      {
        key: { knownPathId: 1, revisionNumber: 1 },
        name: "uq_known_path_revisions_number",
        unique: true,
      },
      {
        key: { knownPathId: 1, createdAt: -1 },
        name: "ix_known_path_revisions_known_path_created_at",
      },
      {
        key: { candidateExperienceIds: 1, createdAt: -1 },
        name: "ix_known_path_revisions_candidates",
      },
      { key: { assessmentIds: 1, createdAt: -1 }, name: "ix_known_path_revisions_assessments" },
    ],
  },
  {
    name: collectionNames.knownPathSearchDocuments,
    validator: envelopeValidator(
      [
        "knownPathId",
        "knownPathRevisionId",
        "idempotencyKey",
        "active",
        "activatedAt",
        "projectionVersion",
        "textSchemaVersion",
        "rankingSchemaVersion",
        "contentHash",
        "title",
        "problemSummary",
        "searchableText",
        "visibilityScope",
        "knownPathStatus",
        "trust",
        "freshness",
        "outcome",
        "embedding",
        "generatedAt",
      ],
      {
        knownPathId: { bsonType: "string" },
        knownPathRevisionId: { bsonType: "string" },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        active: { bsonType: "bool" },
        activatedAt: { bsonType: "date" },
        retiredAt: { bsonType: "date" },
        projectionVersion: { bsonType: numericBsonTypes },
        textSchemaVersion: { bsonType: numericBsonTypes },
        rankingSchemaVersion: { bsonType: numericBsonTypes },
        contentHash: { bsonType: "string" },
        title: { bsonType: "string" },
        problemSummary: { bsonType: "string" },
        searchableText: { bsonType: "string" },
        visibilityScope: { enum: ["public", "private", "team"] },
        knownPathStatus: {
          enum: ["draft", "review", "published", "deprecated", "superseded", "archived"],
        },
        trust: {
          bsonType: "object",
          required: ["score", "grade", "assessmentIds", "scoreVersion"],
        },
        freshness: { bsonType: "object", required: ["status"] },
        outcome: { bsonType: "object", required: ["status"] },
        embedding: {
          bsonType: "object",
          required: [
            "status",
            "providerIdentifier",
            "providerCapability",
            "modelIdentifier",
            "modelVersion",
            "dimensions",
            "inputFormatVersion",
            "inputHash",
          ],
        },
        generatedAt: { bsonType: "date" },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_known_path_search_documents_idempotency",
        unique: true,
      },
      {
        key: {
          knownPathId: 1,
          "embedding.modelIdentifier": 1,
          "embedding.modelVersion": 1,
          "embedding.dimensions": 1,
        },
        name: "uq_known_path_search_documents_active_model",
        unique: true,
        partialFilterExpression: { active: true },
      },
      {
        key: { active: 1, visibilityScope: 1, knownPathStatus: 1, "trust.score": -1 },
        name: "ix_known_path_search_documents_scope_status_trust",
      },
      {
        key: { active: 1, visibilityScope: 1, ownerUserId: 1, knownPathStatus: 1 },
        name: "ix_known_path_search_documents_personal_scope",
        partialFilterExpression: { visibilityScope: "private" },
      },
      {
        key: { active: 1, visibilityScope: 1, workspaceId: 1, knownPathStatus: 1 },
        name: "ix_known_path_search_documents_workspace_scope",
        partialFilterExpression: { visibilityScope: "team" },
      },
      {
        key: { active: 1, ecosystem: 1, packages: 1 },
        name: "ix_known_path_search_documents_ecosystem_packages",
      },
      { key: { active: 1, platforms: 1 }, name: "ix_known_path_search_documents_platforms" },
      {
        key: { active: 1, errorFingerprints: 1 },
        name: "ix_known_path_search_documents_error_fingerprints",
      },
      { key: { active: 1, errorCodes: 1 }, name: "ix_known_path_search_documents_error_codes" },
      {
        key: {
          title: "text",
          normalizedErrors: "text",
          problemSummary: "text",
          searchableText: "text",
          solutions: "text",
          packages: "text",
          environmentTokens: "text",
        },
        name: "tx_known_path_search_documents_v1",
        weights: {
          title: 10,
          normalizedErrors: 10,
          problemSummary: 8,
          solutions: 6,
          packages: 5,
          environmentTokens: 3,
          searchableText: 1,
        },
        default_language: "none",
      },
    ],
  },
  {
    name: collectionNames.extractionAttempts,
    validator: envelopeValidator(
      [
        "idempotencyKey",
        "status",
        "sourceRegistryId",
        "targetSourceItemId",
        "sourceItemIds",
        "sourceContentDigests",
        "contextVersion",
        "contextDigest",
        "strategy",
        "provider",
        "model",
        "providerCapability",
        "prompts",
        "extractionSchemaVersion",
        "generationConfigDigest",
        "estimatedInputTokens",
      ],
      {
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        status: {
          enum: [
            "queued",
            "running",
            "succeeded",
            "irrelevant",
            "insufficient_evidence",
            "conflicting_evidence",
            "quarantined",
            "blocked",
            "failed",
          ],
        },
        sourceRegistryId: { bsonType: "string" },
        targetSourceItemId: { bsonType: "string" },
        sourceItemIds: { bsonType: "array" },
        sourceContentDigests: { bsonType: "array" },
        contextVersion: { bsonType: numericBsonTypes },
        contextDigest: { bsonType: "string" },
        strategy: { enum: ["github_thread", "official_document"] },
        provider: { bsonType: "string" },
        model: { bsonType: "string" },
        providerCapability: { enum: ["public_only", "approved_private"] },
        prompts: { bsonType: "array" },
        extractionSchemaVersion: { bsonType: numericBsonTypes },
        generationConfigDigest: { bsonType: "string" },
        estimatedInputTokens: { bsonType: numericBsonTypes },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_extraction_attempts_idempotency_key",
        unique: true,
      },
      {
        key: { status: 1, "audit.createdAt": 1 },
        name: "ix_extraction_attempts_status_created_at",
      },
      {
        key: { targetSourceItemId: 1, "audit.createdAt": -1 },
        name: "ix_extraction_attempts_target_created_at",
      },
      {
        key: { sourceRegistryId: 1, status: 1, "audit.createdAt": -1 },
        name: "ix_extraction_attempts_registry_status_created_at",
      },
    ],
  },
  {
    name: collectionNames.knowledgeSearchEvents,
    validator: envelopeValidator(
      [
        "principal",
        "accessMode",
        "requestId",
        "queryDigest",
        "digestVersion",
        "querySummary",
        "results",
        "createdAt",
      ],
      {
        principal: { bsonType: "object", required: ["kind", "userId"] },
        accessMode: { enum: ["published", "review"] },
        requestId: { bsonType: "string" },
        queryDigest: { bsonType: "string" },
        digestVersion: { bsonType: numericBsonTypes },
        querySummary: { bsonType: "object" },
        results: { bsonType: "array" },
        selected: { bsonType: "object" },
        createdAt: { bsonType: "date" },
      },
    ),
    indexes: [
      { key: { "principal.userId": 1, createdAt: -1 }, name: "ix_search_events_user_created" },
      {
        key: { "principal.apiKeyId": 1, createdAt: -1 },
        name: "ix_search_events_api_key_created",
        partialFilterExpression: { "principal.apiKeyId": { $exists: true } },
      },
      { key: { requestId: 1 }, name: "uq_search_events_request_id", unique: true },
      {
        key: { "selected.knownPathId": 1, "selected.recordedAt": -1 },
        name: "ix_search_events_selection",
        partialFilterExpression: { "selected.knownPathId": { $exists: true } },
      },
      { key: { accessMode: 1, createdAt: -1 }, name: "ix_search_events_access_created" },
    ],
  },
  {
    name: collectionNames.knownPaths,
    obsoleteIndexes: ["ix_known_paths_visibility_team_status_updated_at"],
    validator: envelopeValidator(["canonicalKey", "status", "metadata", "visibility"], {
      canonicalKey: { bsonType: "object", required: ["value", "version"] },
      status: { enum: ["draft", "review", "published", "deprecated", "superseded", "archived"] },
      metadata: { bsonType: "object", required: ["primaryEcosystem"] },
      visibility: { bsonType: "object", required: ["scope"] },
    }),
    indexes: [
      { key: { "canonicalKey.value": 1 }, name: "uq_known_paths_canonical_key", unique: true },
      {
        key: {
          status: 1,
          "visibility.scope": 1,
          "confidence.aggregate": -1,
          "freshness.lastVerifiedAt": -1,
        },
        name: "ix_known_paths_status_visibility_confidence_freshness",
      },
      {
        key: {
          "visibility.scope": 1,
          "visibility.ownerUserId": 1,
          status: 1,
          "audit.updatedAt": -1,
        },
        name: "ix_known_paths_visibility_owner_status_updated_at",
        partialFilterExpression: { "visibility.scope": "private" },
      },
      {
        key: {
          "visibility.scope": 1,
          "visibility.workspaceId": 1,
          status: 1,
          "audit.updatedAt": -1,
        },
        name: "ix_known_paths_visibility_workspace_status_updated_at",
        partialFilterExpression: { "visibility.scope": "team" },
      },
      {
        key: { "metadata.primaryEcosystem": 1, "metadata.primaryPackageName": 1, status: 1 },
        name: "ix_known_paths_ecosystem_package_status",
      },
      { key: { "metadata.platforms": 1 }, name: "ix_known_paths_platforms" },
      { key: { "metadata.versionStrings": 1 }, name: "ix_known_paths_version_strings" },
      { key: { errorFingerprints: 1 }, name: "ix_known_paths_error_fingerprints" },
      {
        key: { "freshness.lastVerifiedAt": 1, status: 1 },
        name: "ix_known_paths_freshness_status",
      },
      {
        key: { latestRevisionId: 1 },
        name: "ix_known_paths_latest_revision",
        partialFilterExpression: { latestRevisionId: { $exists: true } },
      },
      {
        key: { latestOutcomeAssessmentId: 1 },
        name: "ix_known_paths_latest_outcome_assessment",
        partialFilterExpression: { latestOutcomeAssessmentId: { $exists: true } },
      },
      {
        key: { "safetyReview.status": 1, "safetyReview.latestEventAt": -1 },
        name: "ix_known_paths_safety_review_status_event",
        partialFilterExpression: { "safetyReview.status": { $exists: true } },
      },
    ],
  },
  {
    name: collectionNames.agentContributions,
    validator: envelopeValidator(["deduplicationKey", "status", "visibility"], {
      schemaVersion: { bsonType: numericBsonTypes, enum: [1, 2] },
      deduplicationKey: { bsonType: "object", required: ["value", "version"] },
      status: { enum: ["pending", "accepted", "rejected", "superseded", "quarantined"] },
      visibility: { bsonType: "object", required: ["scope"] },
    }),
    indexes: [
      {
        key: { "deduplicationKey.value": 1 },
        name: "uq_agent_contributions_deduplication_key",
        unique: true,
      },
      {
        key: { "contributor.userId": 1, clientSubmissionId: 1 },
        name: "uq_agent_contributions_owner_submission_v2",
        unique: true,
        partialFilterExpression: { schemaVersion: 2 },
      },
      {
        key: { status: 1, "audit.createdAt": 1 },
        name: "ix_agent_contributions_status_created_at",
      },
      {
        key: { "contributor.userId": 1, "visibility.scope": 1, status: 1, "audit.createdAt": -1 },
        name: "ix_agent_contributions_owner_visibility_status_created_at_v2",
        partialFilterExpression: { schemaVersion: 2 },
      },
      {
        key: { "processing.stage": 1, "audit.updatedAt": 1 },
        name: "ix_agent_contributions_processing_stage_updated_at_v2",
        partialFilterExpression: { schemaVersion: 2 },
      },
      {
        key: { "processing.candidateExperienceId": 1 },
        name: "ix_agent_contributions_candidate_v2",
        partialFilterExpression: { "processing.candidateExperienceId": { $exists: true } },
      },
      {
        key: { knownPathId: 1, "audit.createdAt": -1 },
        name: "ix_agent_contributions_known_path_created_at",
        partialFilterExpression: { knownPathId: { $exists: true } },
      },
    ],
  },
  {
    name: collectionNames.agentOutcomes,
    obsoleteIndexes: ["uq_agent_outcomes_deduplication_key"],
    validator: envelopeValidator(["knownPathId", "outcome"], {
      schemaVersion: { bsonType: numericBsonTypes, enum: [1, 2] },
      knownPathId: { bsonType: "string" },
      outcome: {
        enum: [
          "helpful",
          "not_helpful",
          "partially_helpful",
          "unknown",
          "solved",
          "partially_helped",
          "attempted_failed",
          "incompatible_environment",
          "stale_or_outdated",
          "misleading_or_unsafe",
          "not_used",
        ],
      },
    }),
    indexes: [
      {
        key: { "deduplicationKey.value": 1 },
        name: "uq_agent_outcomes_deduplication_key_legacy",
        unique: true,
        partialFilterExpression: {
          schemaVersion: 1,
          "deduplicationKey.value": { $exists: true },
        },
      },
      {
        key: { knownPathId: 1, "audit.createdAt": -1 },
        name: "ix_agent_outcomes_known_path_created_at",
      },
      {
        key: { outcome: 1, "audit.createdAt": -1 },
        name: "ix_agent_outcomes_outcome_created_at",
      },
      {
        key: { "reporter.userId": 1, clientOutcomeId: 1 },
        name: "uq_agent_outcomes_owner_client_v2",
        unique: true,
        partialFilterExpression: { schemaVersion: 2 },
      },
      {
        key: { "reporter.userId": 1, knownPathId: 1, clientExecutionId: 1 },
        name: "uq_agent_outcomes_owner_execution_target_v2",
        unique: true,
        partialFilterExpression: { schemaVersion: 2 },
      },
      {
        key: { "reporter.apiKeyId": 1, receivedAt: -1 },
        name: "ix_agent_outcomes_api_key_received_v2",
        partialFilterExpression: { schemaVersion: 2 },
      },
      {
        key: { "reporter.userId": 1, receivedAt: -1 },
        name: "ix_agent_outcomes_user_received_v2",
        partialFilterExpression: { schemaVersion: 2 },
      },
      {
        key: {
          knownPathId: 1,
          "aggregationScope.scope": 1,
          "aggregationScope.workspaceId": 1,
          receivedAt: 1,
        },
        name: "ix_agent_outcomes_workspace_aggregate_v2",
        partialFilterExpression: { schemaVersion: 2, "aggregationScope.scope": "team" },
      },
      {
        key: {
          knownPathId: 1,
          "aggregationScope.scope": 1,
          "aggregationScope.ownerUserId": 1,
          receivedAt: 1,
        },
        name: "ix_agent_outcomes_private_aggregate_v2",
        partialFilterExpression: { schemaVersion: 2, "aggregationScope.scope": "private" },
      },
    ],
  },
  {
    name: collectionNames.outcomeAssessments,
    validator: envelopeValidator(
      [
        "knownPathId",
        "knownPathRevisionId",
        "idempotencyKey",
        "algorithm",
        "policy",
        "calculatedAt",
        "counts",
        "confidence",
      ],
      {
        knownPathId: { bsonType: "string" },
        knownPathRevisionId: { bsonType: "string" },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        algorithm: { bsonType: "object" },
        policy: { bsonType: "object" },
        calculatedAt: { bsonType: "date" },
        counts: { bsonType: "object" },
        confidence: { bsonType: "object" },
      },
    ),
    indexes: [
      {
        key: { "idempotencyKey.value": 1 },
        name: "uq_outcome_assessments_idempotency",
        unique: true,
      },
      {
        key: { knownPathId: 1, calculatedAt: -1 },
        name: "ix_outcome_assessments_known_path_calculated",
      },
      {
        key: {
          knownPathId: 1,
          "aggregationScope.scope": 1,
          "aggregationScope.workspaceId": 1,
          calculatedAt: -1,
        },
        name: "ix_outcome_assessments_workspace_calculated",
      },
      {
        key: { "policy.version": 1, calculatedAt: -1 },
        name: "ix_outcome_assessments_policy_calculated",
      },
      {
        key: { "confidence.score": -1, "trend.status": 1 },
        name: "ix_outcome_assessments_confidence_trend",
      },
    ],
  },
  {
    name: collectionNames.safetyEvents,
    validator: envelopeValidator(
      [
        "knownPathId",
        "idempotencyKey",
        "eventType",
        "fromStatus",
        "toStatus",
        "reasonCode",
        "occurredAt",
      ],
      {
        knownPathId: { bsonType: "string" },
        idempotencyKey: { bsonType: "object", required: ["value", "version"] },
        eventType: {
          enum: ["review_queued", "review_started", "review_resolved", "visibility_restricted"],
        },
        fromStatus: { enum: ["clear", "review_queued", "under_review", "resolved", "restricted"] },
        toStatus: { enum: ["clear", "review_queued", "under_review", "resolved", "restricted"] },
        reasonCode: { bsonType: "string" },
        occurredAt: { bsonType: "date" },
      },
    ),
    indexes: [
      { key: { "idempotencyKey.value": 1 }, name: "uq_safety_events_idempotency", unique: true },
      { key: { knownPathId: 1, occurredAt: -1 }, name: "ix_safety_events_known_path_occurred" },
      { key: { eventType: 1, occurredAt: -1 }, name: "ix_safety_events_type_occurred" },
    ],
  },
];

export interface InitializationResult {
  readonly collections: readonly {
    readonly created: boolean;
    readonly indexes: readonly string[];
    readonly name: string;
  }[];
}

export async function initializeDatabase(database: Db): Promise<InitializationResult> {
  const existingCollections = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );
  const initializedCollections: Array<InitializationResult["collections"][number]> = [];

  for (const definition of collectionDefinitions) {
    const created = !existingCollections.has(definition.name);

    if (created) {
      await database.createCollection(definition.name, {
        validator: definition.validator,
        validationAction: "error",
        validationLevel: "strict",
      });
    } else {
      await database.command({
        collMod: definition.name,
        validator: definition.validator,
        validationAction: "error",
        validationLevel: "strict",
      });
    }

    const collection = database.collection(definition.name);
    if (definition.obsoleteIndexes !== undefined) {
      const existingIndexNames = new Set(
        (await collection.indexes())
          .map((index) => index.name)
          .filter((name) => name !== undefined),
      );
      for (const obsoleteIndex of definition.obsoleteIndexes) {
        if (existingIndexNames.has(obsoleteIndex)) {
          await collection.dropIndex(obsoleteIndex);
        }
      }
    }
    const indexes = await collection.createIndexes([...definition.indexes]);
    initializedCollections.push({ created, indexes, name: definition.name });
  }

  return { collections: initializedCollections };
}
