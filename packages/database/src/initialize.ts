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
    validator: envelopeValidator(["kind", "identityKey", "enabled", "visibility"], {
      kind: { enum: ["github_repository", "documentation_site", "release_feed"] },
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
        key: { "visibility.scope": 1, "visibility.teamId": 1 },
        name: "ix_source_registries_visibility_team",
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
    name: collectionNames.knownPaths,
    validator: envelopeValidator(["canonicalKey", "status", "metadata", "visibility"], {
      canonicalKey: { bsonType: "object", required: ["value", "version"] },
      status: { enum: ["draft", "published", "deprecated", "superseded", "archived"] },
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
          "visibility.teamId": 1,
          status: 1,
          "audit.updatedAt": -1,
        },
        name: "ix_known_paths_visibility_team_status_updated_at",
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
    ],
  },
  {
    name: collectionNames.agentContributions,
    validator: envelopeValidator(["deduplicationKey", "status", "visibility"], {
      deduplicationKey: { bsonType: "object", required: ["value", "version"] },
      status: { enum: ["pending", "accepted", "rejected", "superseded"] },
      visibility: { bsonType: "object", required: ["scope"] },
    }),
    indexes: [
      {
        key: { "deduplicationKey.value": 1 },
        name: "uq_agent_contributions_deduplication_key",
        unique: true,
      },
      {
        key: { status: 1, "audit.createdAt": 1 },
        name: "ix_agent_contributions_status_created_at",
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
    validator: envelopeValidator(["knownPathId", "deduplicationKey", "outcome"], {
      knownPathId: { bsonType: "string" },
      deduplicationKey: { bsonType: "object", required: ["value", "version"] },
      outcome: { enum: ["helpful", "not_helpful", "partially_helpful", "unknown"] },
    }),
    indexes: [
      {
        key: { "deduplicationKey.value": 1 },
        name: "uq_agent_outcomes_deduplication_key",
        unique: true,
      },
      {
        key: { knownPathId: 1, "audit.createdAt": -1 },
        name: "ix_agent_outcomes_known_path_created_at",
      },
      {
        key: { outcome: 1, "audit.createdAt": -1 },
        name: "ix_agent_outcomes_outcome_created_at",
      },
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
