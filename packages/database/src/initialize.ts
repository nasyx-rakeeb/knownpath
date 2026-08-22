import type { Db, Document, IndexDescription } from "mongodb";

import { collectionNames } from "./collections.js";

interface CollectionDefinition {
  readonly indexes: readonly IndexDescription[];
  readonly name: (typeof collectionNames)[keyof typeof collectionNames];
  readonly validator: Document;
}

const numericBsonTypes = ["int", "long", "double", "decimal"] as const;

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
    validator: envelopeValidator(["normalizedEmail", "status"], {
      normalizedEmail: { bsonType: "string" },
      status: { enum: ["active", "suspended", "deleted"] },
    }),
    indexes: [
      { key: { normalizedEmail: 1 }, name: "uq_users_normalized_email", unique: true },
      { key: { status: 1, "audit.updatedAt": -1 }, name: "ix_users_status_updated_at" },
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
      { key: { keyHash: 1 }, name: "uq_api_keys_key_hash", unique: true },
      {
        key: { userId: 1, status: 1, "audit.createdAt": -1 },
        name: "ix_api_keys_user_status_created_at",
      },
    ],
  },
  {
    name: collectionNames.sourceRegistries,
    validator: envelopeValidator(["kind", "identityKey", "enabled", "visibility"], {
      kind: { enum: ["github_repository", "documentation"] },
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
    const indexes = await collection.createIndexes([...definition.indexes]);
    initializedCollections.push({ created, indexes, name: definition.name });
  }

  return { collections: initializedCollections };
}
