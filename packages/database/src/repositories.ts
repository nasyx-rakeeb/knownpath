import {
  agentContributionSchema,
  agentOutcomeSchema,
  apiKeySchema,
  auditEventSchema,
  candidateAssessmentSchema,
  candidateEmbeddingSchema,
  candidateExperienceSchema,
  candidatePairAssessmentSchema,
  candidateSimilarityProfileSchema,
  canonicalMembershipSchema,
  canonicalizationEventSchema,
  extractionAttemptSchema,
  ingestionRunSchema,
  knownPathSchema,
  knownPathRevisionSchema,
  knownPathSearchDocumentSchema,
  knowledgeSearchEventSchema,
  sourceItemSchema,
  sourceItemStateSchema,
  sourceRegistrySchema,
  userSchema,
  type AgentContribution,
  type AgentContributionId,
  type AgentOutcome,
  type AgentOutcomeId,
  type ApiKey,
  type ApiKeyId,
  type AuditEvent,
  type AuditEventId,
  type CandidateAssessment,
  type CandidateAssessmentId,
  type CandidateEmbedding,
  type CandidateEmbeddingId,
  type CandidateExperience,
  type CandidateExperienceId,
  type CandidatePairAssessment,
  type CandidatePairAssessmentId,
  type CandidateSimilarityProfile,
  type CanonicalMembership,
  type CanonicalMembershipId,
  type CanonicalizationEvent,
  type CanonicalizationEventId,
  type CanonicalizationOperationId,
  type ExtractionAttempt,
  type ExtractionAttemptId,
  type IngestionRun,
  type IngestionRunId,
  type KnownPath,
  type KnownPathId,
  type KnownPathRevision,
  type KnownPathRevisionId,
  type KnownPathSearchDocument,
  type KnownPathSearchDocumentId,
  type KnowledgeSearchEvent,
  type KnowledgeSearchEventId,
  type SimilarityProfileId,
  type SourceItem,
  type SourceItemId,
  type SourceItemState,
  type SourceItemStateId,
  type SourceRegistry,
  type SourceRegistryId,
  type User,
  type UserId,
  type VersionedKey,
} from "@knownpath/domain";
import type {
  Collection,
  Filter,
  MatchKeysAndValues,
  OptionalUnlessRequiredId,
  WithId,
} from "mongodb";
import { MongoServerError } from "mongodb";

import type { KnownPathCollections } from "./collections.js";

interface StoredEntity {
  readonly _id: string;
}

interface RuntimeSchema<Entity> {
  parse(value: unknown): Entity;
}

export interface EntityRepository<Entity, Id> {
  create(entity: Entity): Promise<Entity>;
  findById(id: Id): Promise<Entity | null>;
}

class MongoEntityRepository<Entity extends StoredEntity, Id extends string> {
  public constructor(
    protected readonly collection: Collection<Entity>,
    private readonly schema: RuntimeSchema<Entity>,
    private readonly updatedAtPath = "audit.updatedAt",
  ) {}

  public async create(entity: Entity): Promise<Entity> {
    const parsed = this.schema.parse(entity);
    await this.collection.insertOne(parsed as OptionalUnlessRequiredId<Entity>);
    return parsed;
  }

  public async findById(id: Id): Promise<Entity | null> {
    return this.findOne({ _id: id } as Filter<Entity>);
  }

  protected async findOne(filter: Filter<Entity>): Promise<Entity | null> {
    const result = await this.collection.findOne(filter);
    return result === null ? null : this.parseStored(result);
  }

  protected async updateOne(
    filter: Filter<Entity>,
    update: MatchKeysAndValues<Entity>,
  ): Promise<Entity | null> {
    const result = await this.collection.findOneAndUpdate(
      filter,
      { $set: { ...update, [this.updatedAtPath]: new Date() } },
      { returnDocument: "after" },
    );

    return result === null ? null : this.parseStored(result);
  }

  private parseStored(document: WithId<Entity>): Entity {
    return this.schema.parse(document);
  }
}

export class UserRepository
  extends MongoEntityRepository<User, UserId>
  implements EntityRepository<User, UserId>
{
  public constructor(collection: Collection<User>) {
    super(collection, userSchema, "updatedAt");
  }

  public async findByNormalizedEmail(normalizedEmail: string): Promise<User | null> {
    return this.findOne({ normalizedEmail });
  }

  public async updateStatus(id: UserId, status: User["status"]): Promise<User | null> {
    return this.updateOne({ _id: id }, { status });
  }
}

export class AuditEventRepository
  extends MongoEntityRepository<AuditEvent, AuditEventId>
  implements EntityRepository<AuditEvent, AuditEventId>
{
  public constructor(collection: Collection<AuditEvent>) {
    super(collection, auditEventSchema, "occurredAt");
  }
}

export class ApiKeyRepository
  extends MongoEntityRepository<ApiKey, ApiKeyId>
  implements EntityRepository<ApiKey, ApiKeyId>
{
  public constructor(collection: Collection<ApiKey>) {
    super(collection, apiKeySchema);
  }

  public async findByHash(keyHash: string): Promise<ApiKey | null> {
    return this.findOne({ keyHash });
  }

  public async findByPrefix(prefix: string): Promise<ApiKey | null> {
    return this.findOne({ prefix });
  }

  public async listByUserId(userId: UserId): Promise<ApiKey[]> {
    const documents = await this.collection
      .find({ userId })
      .sort({ "audit.createdAt": -1 })
      .toArray();
    return documents.map((document) => apiKeySchema.parse(document));
  }

  public async replaceSecret(
    id: ApiKeyId,
    keyHash: string,
    prefix: string,
  ): Promise<ApiKey | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id, status: "active" },
      {
        $set: { keyHash, prefix, "audit.updatedAt": new Date() },
        $unset: { lastUsedAt: "" },
      },
      { returnDocument: "after" },
    );
    return result === null ? null : apiKeySchema.parse(result);
  }

  public async recordLastUsed(id: ApiKeyId, usedAt: Date): Promise<ApiKey | null> {
    return this.updateOne({ _id: id, status: "active" }, { lastUsedAt: usedAt });
  }

  public async revoke(id: ApiKeyId, revokedAt = new Date()): Promise<ApiKey | null> {
    return this.updateOne({ _id: id, status: "active" }, { status: "revoked", revokedAt });
  }
}

export class SourceRegistryRepository
  extends MongoEntityRepository<SourceRegistry, SourceRegistryId>
  implements EntityRepository<SourceRegistry, SourceRegistryId>
{
  public constructor(collection: Collection<SourceRegistry>) {
    super(collection, sourceRegistrySchema);
  }

  public async findByIdentityKey(identityKey: VersionedKey): Promise<SourceRegistry | null> {
    return this.findOne({ "identityKey.value": identityKey.value });
  }

  public async findBySourceKey(sourceKey: string): Promise<SourceRegistry | null> {
    const documents = await this.collection.find({ enabled: true }).toArray();
    const match = documents.find((document) => document.configuration["source.key"] === sourceKey);
    return match === undefined ? null : sourceRegistrySchema.parse(match);
  }

  public async setEnabled(id: SourceRegistryId, enabled: boolean): Promise<SourceRegistry | null> {
    return this.updateOne({ _id: id }, { enabled });
  }

  public async listEnabledGitHub(): Promise<SourceRegistry[]> {
    const documents = await this.collection
      .find({ enabled: true, kind: "github_repository" })
      .sort({ name: 1 })
      .toArray();
    return documents.map((document) => sourceRegistrySchema.parse(document));
  }

  public async listEnabledByKind(kind: SourceRegistry["kind"]): Promise<SourceRegistry[]> {
    const documents = await this.collection
      .find({ enabled: true, kind })
      .sort({ name: 1 })
      .toArray();
    return documents.map((document) => sourceRegistrySchema.parse(document));
  }

  public async updateDefinition(
    id: SourceRegistryId,
    definition: Pick<
      SourceRegistry,
      | "name"
      | "originalUrl"
      | "canonicalUrl"
      | "enabled"
      | "ecosystemHints"
      | "configuration"
      | "visibility"
      | "kind"
    >,
  ): Promise<SourceRegistry | null> {
    return this.updateOne({ _id: id }, definition);
  }

  public async recordAttempt(
    id: SourceRegistryId,
    attemptedAt: Date,
  ): Promise<SourceRegistry | null> {
    return this.updateOne({ _id: id }, { lastIngestionAttemptAt: attemptedAt });
  }

  public async recordSuccess(
    id: SourceRegistryId,
    succeededAt: Date,
    cursor: Readonly<Record<string, string>>,
  ): Promise<SourceRegistry | null> {
    return this.updateOne(
      { _id: id },
      { lastSuccessfulIngestionAt: succeededAt, cursor: { ...cursor } },
    );
  }

  public async removeVerificationRecord(
    id: SourceRegistryId,
    expectedIdentityKey: VersionedKey,
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: id,
      "identityKey.value": expectedIdentityKey.value,
    });
    return result.deletedCount === 1;
  }
}

export class SourceItemStateRepository
  extends MongoEntityRepository<SourceItemState, SourceItemStateId>
  implements EntityRepository<SourceItemState, SourceItemStateId>
{
  public constructor(collection: Collection<SourceItemState>) {
    super(collection, sourceItemStateSchema);
  }

  public async findBySourceIdentity(
    sourceRegistryId: SourceRegistryId,
    sourceItemIdentity: string,
  ): Promise<SourceItemState | null> {
    return this.findOne({ sourceRegistryId, sourceItemIdentity });
  }

  public async listByRegistry(sourceRegistryId: SourceRegistryId): Promise<SourceItemState[]> {
    const documents = await this.collection.find({ sourceRegistryId }).toArray();
    return documents.map((document) => sourceItemStateSchema.parse(document));
  }

  public async upsert(entity: SourceItemState): Promise<SourceItemState> {
    const parsed = sourceItemStateSchema.parse(entity);
    const result = await this.collection.findOneAndUpdate(
      { sourceRegistryId: parsed.sourceRegistryId, sourceItemIdentity: parsed.sourceItemIdentity },
      {
        $set: {
          canonicalUrl: parsed.canonicalUrl,
          itemType: parsed.itemType,
          lifecycleStatus: parsed.lifecycleStatus,
          lastFetchedAt: parsed.lastFetchedAt,
          lastObservedAt: parsed.lastObservedAt,
          "audit.updatedAt": parsed.audit.updatedAt,
          ...(parsed.latestSourceItemId === undefined
            ? {}
            : { latestSourceItemId: parsed.latestSourceItemId }),
          ...(parsed.contentDigest === undefined ? {} : { contentDigest: parsed.contentDigest }),
          ...(parsed.etag === undefined ? {} : { etag: parsed.etag }),
          ...(parsed.lastModified === undefined ? {} : { lastModified: parsed.lastModified }),
          ...(parsed.observedRevision === undefined
            ? {}
            : { observedRevision: parsed.observedRevision }),
          ...(parsed.lastChangedAt === undefined ? {} : { lastChangedAt: parsed.lastChangedAt }),
          ...(parsed.sourceQuality === undefined ? {} : { sourceQuality: parsed.sourceQuality }),
          ...(parsed.documentMetadata === undefined
            ? {}
            : { documentMetadata: parsed.documentMetadata }),
        },
        $setOnInsert: {
          _id: parsed._id,
          schemaVersion: parsed.schemaVersion,
          sourceRegistryId: parsed.sourceRegistryId,
          sourceItemIdentity: parsed.sourceItemIdentity,
          "audit.createdAt": parsed.audit.createdAt,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (result === null) throw new Error("Source item state upsert returned no document");
    return sourceItemStateSchema.parse(result);
  }
}

export class SourceItemRepository
  extends MongoEntityRepository<SourceItem, SourceItemId>
  implements EntityRepository<SourceItem, SourceItemId>
{
  public constructor(collection: Collection<SourceItem>) {
    super(collection, sourceItemSchema);
  }

  public async findByDeduplicationKey(key: VersionedKey): Promise<SourceItem | null> {
    return this.findOne({ "deduplicationKey.value": key.value });
  }

  public async findByIds(ids: readonly SourceItemId[]): Promise<SourceItem[]> {
    if (ids.length === 0) return [];
    const documents = await this.collection.find({ _id: { $in: [...ids] } }).toArray();
    return documents.map((document) => sourceItemSchema.parse(document));
  }

  public async findLatestBySourceIdentity(
    sourceRegistryId: SourceRegistryId,
    sourceItemIdentity: string,
  ): Promise<SourceItem | null> {
    const document = await this.collection.findOne(
      { sourceRegistryId, "provenance.sourceItemIdentity": sourceItemIdentity },
      { sort: { capturedAt: -1 } },
    );
    return document === null ? null : sourceItemSchema.parse(document);
  }

  public async createIfAbsent(entity: SourceItem): Promise<SourceItem | null> {
    const parsed = sourceItemSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        return null;
      }
      throw error;
    }
  }

  public async removeVerificationRecord(id: SourceItemId): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }

  public async listLatestForRoot(
    sourceRegistryId: SourceRegistryId,
    rootSourceItemIdentity: string,
  ): Promise<SourceItem[]> {
    const documents = await this.collection
      .aggregate<SourceItem>([
        {
          $match: {
            sourceRegistryId,
            $or: [
              { "provenance.sourceItemIdentity": rootSourceItemIdentity },
              { "provenance.rootSourceItemIdentity": rootSourceItemIdentity },
            ],
          },
        },
        { $sort: { capturedAt: -1 } },
        { $group: { _id: "$provenance.sourceItemIdentity", item: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$item" } },
        { $sort: { "provenance.publishedAt": 1, capturedAt: 1 } },
      ])
      .toArray();
    return documents.map((document) => sourceItemSchema.parse(document));
  }

  public async listLatestExtractionTargets(
    limit: number,
    sourceRegistryId?: SourceRegistryId,
  ): Promise<SourceItem[]> {
    const match: Filter<SourceItem> = {
      itemType: { $in: ["issue", "discussion", "documentation_page", "release_note"] },
      ...(sourceRegistryId === undefined ? {} : { sourceRegistryId }),
    };
    const documents = await this.collection
      .aggregate<SourceItem>([
        { $match: match },
        { $sort: { capturedAt: -1 } },
        {
          $group: {
            _id: { registry: "$sourceRegistryId", identity: "$provenance.sourceItemIdentity" },
            item: { $first: "$$ROOT" },
          },
        },
        { $replaceRoot: { newRoot: "$item" } },
        { $sort: { capturedAt: 1 } },
        { $limit: limit },
      ])
      .toArray();
    return documents.map((document) => sourceItemSchema.parse(document));
  }
}

export class ExtractionAttemptRepository
  extends MongoEntityRepository<ExtractionAttempt, ExtractionAttemptId>
  implements EntityRepository<ExtractionAttempt, ExtractionAttemptId>
{
  public constructor(collection: Collection<ExtractionAttempt>) {
    super(collection, extractionAttemptSchema);
  }

  public async createIfAbsent(entity: ExtractionAttempt): Promise<ExtractionAttempt | null> {
    const parsed = extractionAttemptSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<ExtractionAttempt | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }

  public async updateResult(
    id: ExtractionAttemptId,
    update: Partial<
      Pick<
        ExtractionAttempt,
        | "candidateExperienceId"
        | "classification"
        | "classificationReason"
        | "completedAt"
        | "failureCode"
        | "failureMessage"
        | "latencyMs"
        | "providerInteractionId"
        | "responseDigest"
        | "retryCount"
        | "startedAt"
        | "status"
        | "usage"
        | "validationIssues"
      >
    >,
  ): Promise<ExtractionAttempt | null> {
    return this.updateOne({ _id: id }, update as MatchKeysAndValues<ExtractionAttempt>);
  }

  public async removeVerificationRecord(id: ExtractionAttemptId): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

export class IngestionRunRepository
  extends MongoEntityRepository<IngestionRun, IngestionRunId>
  implements EntityRepository<IngestionRun, IngestionRunId>
{
  public constructor(collection: Collection<IngestionRun>) {
    super(collection, ingestionRunSchema);
  }

  public async updateStatus(
    id: IngestionRunId,
    status: IngestionRun["status"],
  ): Promise<IngestionRun | null> {
    return this.updateOne({ _id: id }, { status });
  }

  public async start(id: IngestionRunId, startedAt = new Date()): Promise<IngestionRun | null> {
    return this.updateOne({ _id: id, status: "queued" }, { status: "running", startedAt });
  }

  public async updateCounters(
    id: IngestionRunId,
    counters: IngestionRun["counters"],
    stage: string,
  ): Promise<IngestionRun | null> {
    return this.updateOne({ _id: id, status: "running" }, { counters, stage });
  }

  public async succeed(
    id: IngestionRunId,
    counters: IngestionRun["counters"],
    completedAt = new Date(),
  ): Promise<IngestionRun | null> {
    return this.updateOne(
      { _id: id, status: "running" },
      { status: "succeeded", stage: "complete", counters, completedAt },
    );
  }

  public async fail(
    id: IngestionRunId,
    counters: IngestionRun["counters"],
    failure: NonNullable<IngestionRun["failure"]>,
    completedAt = new Date(),
  ): Promise<IngestionRun | null> {
    return this.updateOne(
      { _id: id, status: { $in: ["queued", "running"] } } as Filter<IngestionRun>,
      { status: "failed", stage: "failed", counters, failure, completedAt },
    );
  }
}

export class CandidateExperienceRepository
  extends MongoEntityRepository<CandidateExperience, CandidateExperienceId>
  implements EntityRepository<CandidateExperience, CandidateExperienceId>
{
  public constructor(collection: Collection<CandidateExperience>) {
    super(collection, candidateExperienceSchema);
  }

  public async findByDeduplicationKey(key: VersionedKey): Promise<CandidateExperience | null> {
    return this.findOne({ "deduplicationKey.value": key.value });
  }

  public async createIfAbsent(entity: CandidateExperience): Promise<CandidateExperience | null> {
    const parsed = candidateExperienceSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async updateStatus(
    id: CandidateExperienceId,
    status: CandidateExperience["status"],
  ): Promise<CandidateExperience | null> {
    return this.updateOne({ _id: id }, { status });
  }

  public async listForScoring(
    limit: number,
    onlyWithoutAssessment = false,
  ): Promise<CandidateExperience[]> {
    const documents = await this.collection
      .find(onlyWithoutAssessment ? { latestAssessmentId: { $exists: false } } : {})
      .sort({ "audit.createdAt": 1, _id: 1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => candidateExperienceSchema.parse(document));
  }

  public async listForCanonicalization(limit: number): Promise<CandidateExperience[]> {
    const documents = await this.collection
      .find({ status: { $in: ["pending", "accepted"] }, latestAssessmentId: { $exists: true } })
      .sort({ "audit.createdAt": 1, _id: 1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => candidateExperienceSchema.parse(document));
  }

  public async findManyByIds(
    ids: readonly CandidateExperienceId[],
  ): Promise<CandidateExperience[]> {
    if (ids.length === 0) return [];
    const documents = await this.collection.find({ _id: { $in: [...ids] } }).toArray();
    return documents.map((document) => candidateExperienceSchema.parse(document));
  }

  public async setLatestAssessment(
    id: CandidateExperienceId,
    assessmentId: CandidateAssessmentId,
  ): Promise<CandidateExperience | null> {
    return this.updateOne({ _id: id }, { latestAssessmentId: assessmentId });
  }

  public async removeVerificationRecord(id: CandidateExperienceId): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

export class CandidateAssessmentRepository
  extends MongoEntityRepository<CandidateAssessment, CandidateAssessmentId>
  implements EntityRepository<CandidateAssessment, CandidateAssessmentId>
{
  public constructor(collection: Collection<CandidateAssessment>) {
    super(collection, candidateAssessmentSchema);
  }

  public async createIfAbsent(entity: CandidateAssessment): Promise<CandidateAssessment | null> {
    const parsed = candidateAssessmentSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<CandidateAssessment | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }

  public async listByCandidate(
    candidateExperienceId: CandidateExperienceId,
    limit = 50,
  ): Promise<CandidateAssessment[]> {
    const documents = await this.collection
      .find({ candidateExperienceId })
      .sort({ evaluatedAt: -1, "audit.createdAt": -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => candidateAssessmentSchema.parse(document));
  }

  public async removeVerificationRecord(id: CandidateAssessmentId): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }
}

export class CandidateSimilarityProfileRepository
  extends MongoEntityRepository<CandidateSimilarityProfile, SimilarityProfileId>
  implements EntityRepository<CandidateSimilarityProfile, SimilarityProfileId>
{
  public constructor(collection: Collection<CandidateSimilarityProfile>) {
    super(collection, candidateSimilarityProfileSchema);
  }

  public async createIfAbsent(
    entity: CandidateSimilarityProfile,
  ): Promise<CandidateSimilarityProfile | null> {
    const parsed = candidateSimilarityProfileSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<CandidateSimilarityProfile | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }

  public async findLatestByCandidate(
    candidateExperienceId: CandidateExperienceId,
  ): Promise<CandidateSimilarityProfile | null> {
    const result = await this.collection.findOne(
      { candidateExperienceId },
      { sort: { generatedAt: -1, _id: -1 } },
    );
    return result === null ? null : candidateSimilarityProfileSchema.parse(result);
  }

  public async listByBlockingValues(
    values: readonly string[],
    normalizerVersion: number,
    excludeCandidateId: CandidateExperienceId,
    limit = 500,
  ): Promise<CandidateSimilarityProfile[]> {
    const documents = await this.collection
      .find({
        candidateExperienceId: { $ne: excludeCandidateId },
        "normalizer.version": normalizerVersion,
        "blockingKeys.value": { $in: [...values] },
      })
      .sort({ generatedAt: -1, _id: 1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => candidateSimilarityProfileSchema.parse(document));
  }
}

export class CandidateEmbeddingRepository
  extends MongoEntityRepository<CandidateEmbedding, CandidateEmbeddingId>
  implements EntityRepository<CandidateEmbedding, CandidateEmbeddingId>
{
  public constructor(collection: Collection<CandidateEmbedding>) {
    super(collection, candidateEmbeddingSchema);
  }

  public async createIfAbsent(entity: CandidateEmbedding): Promise<CandidateEmbedding | null> {
    const parsed = candidateEmbeddingSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<CandidateEmbedding | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }
}

export class CandidatePairAssessmentRepository
  extends MongoEntityRepository<CandidatePairAssessment, CandidatePairAssessmentId>
  implements EntityRepository<CandidatePairAssessment, CandidatePairAssessmentId>
{
  public constructor(collection: Collection<CandidatePairAssessment>) {
    super(collection, candidatePairAssessmentSchema);
  }

  public async createIfAbsent(
    entity: CandidatePairAssessment,
  ): Promise<CandidatePairAssessment | null> {
    const parsed = candidatePairAssessmentSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<CandidatePairAssessment | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }

  public async listForReview(limit = 100): Promise<CandidatePairAssessment[]> {
    const documents = await this.collection
      .find({ decision: "review" })
      .sort({ "semantic.cosineSimilarity": -1, evaluatedAt: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => candidatePairAssessmentSchema.parse(document));
  }
}

export class CanonicalMembershipRepository
  extends MongoEntityRepository<CanonicalMembership, CanonicalMembershipId>
  implements EntityRepository<CanonicalMembership, CanonicalMembershipId>
{
  public constructor(collection: Collection<CanonicalMembership>) {
    super(collection, canonicalMembershipSchema);
  }

  public async createIfAbsent(entity: CanonicalMembership): Promise<CanonicalMembership | null> {
    const parsed = canonicalMembershipSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async listActiveByKnownPath(knownPathId: KnownPathId): Promise<CanonicalMembership[]> {
    const documents = await this.collection
      .find({ knownPathId, active: true })
      .sort({ disposition: 1, assignedAt: 1, _id: 1 })
      .toArray();
    return documents.map((document) => canonicalMembershipSchema.parse(document));
  }

  public async findActiveSupportingByCandidate(
    candidateExperienceId: CandidateExperienceId,
  ): Promise<CanonicalMembership | null> {
    return this.findOne({ candidateExperienceId, disposition: "supporting", active: true });
  }

  public async deactivate(
    id: CanonicalMembershipId,
    operationId: CanonicalizationOperationId,
    endedAt = new Date(),
  ): Promise<CanonicalMembership | null> {
    return this.updateOne({ _id: id, active: true }, { active: false, endedAt, operationId });
  }
}

export class CanonicalizationEventRepository
  extends MongoEntityRepository<CanonicalizationEvent, CanonicalizationEventId>
  implements EntityRepository<CanonicalizationEvent, CanonicalizationEventId>
{
  public constructor(collection: Collection<CanonicalizationEvent>) {
    super(collection, canonicalizationEventSchema);
  }

  public async createIfAbsent(
    entity: CanonicalizationEvent,
  ): Promise<CanonicalizationEvent | null> {
    const parsed = canonicalizationEventSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async listByOperation(
    operationId: CanonicalizationOperationId,
  ): Promise<CanonicalizationEvent[]> {
    const documents = await this.collection.find({ operationId }).sort({ sequence: 1 }).toArray();
    return documents.map((document) => canonicalizationEventSchema.parse(document));
  }
}

export class KnownPathRevisionRepository
  extends MongoEntityRepository<KnownPathRevision, KnownPathRevisionId>
  implements EntityRepository<KnownPathRevision, KnownPathRevisionId>
{
  public constructor(collection: Collection<KnownPathRevision>) {
    super(collection, knownPathRevisionSchema);
  }

  public async createIfAbsent(entity: KnownPathRevision): Promise<KnownPathRevision | null> {
    const parsed = knownPathRevisionSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<KnownPathRevision | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }

  public async nextRevisionNumber(knownPathId: KnownPathId): Promise<number> {
    const latest = await this.collection.findOne({ knownPathId }, { sort: { revisionNumber: -1 } });
    return (latest?.revisionNumber ?? 0) + 1;
  }
}

export class KnownPathRepository
  extends MongoEntityRepository<KnownPath, KnownPathId>
  implements EntityRepository<KnownPath, KnownPathId>
{
  public constructor(collection: Collection<KnownPath>) {
    super(collection, knownPathSchema);
  }

  public async findByCanonicalKey(key: VersionedKey): Promise<KnownPath | null> {
    return this.findOne({ "canonicalKey.value": key.value });
  }

  public async findManyByIds(ids: readonly KnownPathId[]): Promise<KnownPath[]> {
    if (ids.length === 0) return [];
    const documents = await this.collection.find({ _id: { $in: [...ids] } }).toArray();
    return documents.map((document) => knownPathSchema.parse(document));
  }

  public async updateStatus(
    id: KnownPathId,
    status: KnownPath["status"],
  ): Promise<KnownPath | null> {
    return this.updateOne({ _id: id }, { status });
  }

  public async updateProjection(
    id: KnownPathId,
    projection: Omit<KnownPath, "_id" | "schemaVersion" | "canonicalKey" | "audit">,
  ): Promise<KnownPath | null> {
    return this.updateOne({ _id: id }, projection);
  }

  public async listForSearchProjection(limit = 100): Promise<KnownPath[]> {
    const documents = await this.collection
      .find({ status: { $in: ["review", "published"] }, latestRevisionId: { $exists: true } })
      .sort({ "audit.updatedAt": 1, _id: 1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => knownPathSchema.parse(document));
  }
}

export class KnowledgeSearchEventRepository
  extends MongoEntityRepository<KnowledgeSearchEvent, KnowledgeSearchEventId>
  implements EntityRepository<KnowledgeSearchEvent, KnowledgeSearchEventId>
{
  public constructor(collection: Collection<KnowledgeSearchEvent>) {
    super(collection, knowledgeSearchEventSchema);
  }

  public async recordSelection(
    id: KnowledgeSearchEventId,
    principal: KnowledgeSearchEvent["principal"],
    selected: NonNullable<KnowledgeSearchEvent["selected"]>,
  ): Promise<KnowledgeSearchEvent | null> {
    return this.updateOne({ _id: id, principal, selected: { $exists: false } }, { selected });
  }
}

export interface SearchChannelHit {
  readonly document: KnownPathSearchDocument;
  readonly score: number;
}

export class KnownPathSearchDocumentRepository
  extends MongoEntityRepository<KnownPathSearchDocument, KnownPathSearchDocumentId>
  implements EntityRepository<KnownPathSearchDocument, KnownPathSearchDocumentId>
{
  public constructor(collection: Collection<KnownPathSearchDocument>) {
    super(collection, knownPathSearchDocumentSchema);
  }

  public async createIfAbsent(
    entity: KnownPathSearchDocument,
  ): Promise<KnownPathSearchDocument | null> {
    const parsed = knownPathSearchDocumentSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<KnownPathSearchDocument | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }

  public async findActive(
    knownPathId: KnownPathId,
    modelIdentifier: string,
    modelVersion: string,
    dimensions: number,
  ): Promise<KnownPathSearchDocument | null> {
    return this.findOne({
      knownPathId,
      active: true,
      "embedding.modelIdentifier": modelIdentifier,
      "embedding.modelVersion": modelVersion,
      "embedding.dimensions": dimensions,
    });
  }

  public async retireActive(
    knownPathId: KnownPathId,
    modelIdentifier: string,
    modelVersion: string,
    dimensions: number,
    exceptId: KnownPathSearchDocumentId,
    retiredAt = new Date(),
  ): Promise<number> {
    const result = await this.collection.updateMany(
      {
        knownPathId,
        active: true,
        _id: { $ne: exceptId },
        "embedding.modelIdentifier": modelIdentifier,
        "embedding.modelVersion": modelVersion,
        "embedding.dimensions": dimensions,
      },
      { $set: { active: false, retiredAt, "audit.updatedAt": retiredAt } },
    );
    return result.modifiedCount;
  }

  public async activate(
    id: KnownPathSearchDocumentId,
    activatedAt = new Date(),
  ): Promise<KnownPathSearchDocument | null> {
    return this.updateOne({ _id: id }, { active: true, activatedAt });
  }

  public async listActive(
    statuses: readonly KnownPath["status"][],
    limit: number,
  ): Promise<KnownPathSearchDocument[]> {
    const documents = await this.collection
      .find({ active: true, knownPathStatus: { $in: [...statuses] } })
      .limit(limit)
      .toArray();
    return documents.map((document) => knownPathSearchDocumentSchema.parse(document));
  }

  public async exactCandidates(input: {
    statuses: readonly KnownPath["status"][];
    visibilityScope: "public" | "private" | "team";
    errorFingerprints: readonly string[];
    errorCodes: readonly string[];
    ecosystem?: string;
    packages: readonly string[];
    platforms: readonly string[];
    limit: number;
  }): Promise<KnownPathSearchDocument[]> {
    const signals: Filter<KnownPathSearchDocument>[] = [];
    if (input.errorFingerprints.length > 0)
      signals.push({ errorFingerprints: { $in: [...input.errorFingerprints] } });
    if (input.errorCodes.length > 0) signals.push({ errorCodes: { $in: [...input.errorCodes] } });
    if (input.ecosystem !== undefined) signals.push({ ecosystem: input.ecosystem });
    if (input.packages.length > 0) signals.push({ packages: { $in: [...input.packages] } });
    if (input.platforms.length > 0) signals.push({ platforms: { $in: [...input.platforms] } });
    if (signals.length === 0) return [];
    const documents = await this.collection
      .find({
        active: true,
        visibilityScope: input.visibilityScope,
        knownPathStatus: { $in: [...input.statuses] },
        $or: signals,
      })
      .limit(input.limit)
      .toArray();
    return documents.map((document) => knownPathSearchDocumentSchema.parse(document));
  }

  public async localTextSearch(
    text: string,
    statuses: readonly KnownPath["status"][],
    visibilityScope: "public" | "private" | "team",
    limit: number,
  ): Promise<SearchChannelHit[]> {
    const documents = (await this.collection
      .find(
        {
          $text: { $search: text },
          active: true,
          visibilityScope,
          knownPathStatus: { $in: [...statuses] },
        },
        { projection: { score: { $meta: "textScore" } } },
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(limit)
      .toArray()) as Array<KnownPathSearchDocument & { score?: number }>;
    return documents.map(({ score = 0, ...document }) => ({
      document: knownPathSearchDocumentSchema.parse(document),
      score,
    }));
  }

  public async atlasTextSearch(
    text: string,
    statuses: readonly KnownPath["status"][],
    visibilityScope: "public" | "private" | "team",
    index: string,
    limit: number,
  ): Promise<SearchChannelHit[]> {
    const documents = (await this.collection
      .aggregate([
        {
          $search: {
            index,
            compound: {
              must: [
                {
                  text: {
                    query: text,
                    path: [
                      "title",
                      "problemSummary",
                      "searchableText",
                      "normalizedErrors",
                      "solutions",
                    ],
                  },
                },
              ],
              filter: [
                { equals: { path: "active", value: true } },
                { equals: { path: "visibilityScope", value: visibilityScope } },
                { in: { path: "knownPathStatus", value: [...statuses] } },
              ],
            },
          },
        },
        { $limit: limit },
        { $set: { _channelScore: { $meta: "searchScore" } } },
      ])
      .toArray()) as Array<KnownPathSearchDocument & { _channelScore?: number }>;
    return documents.map(({ _channelScore = 0, ...document }) => ({
      document: knownPathSearchDocumentSchema.parse(document),
      score: _channelScore,
    }));
  }

  public async atlasVectorSearch(
    vector: readonly number[],
    statuses: readonly KnownPath["status"][],
    visibilityScope: "public" | "private" | "team",
    modelIdentifier: string,
    modelVersion: string,
    dimensions: number,
    index: string,
    limit: number,
    numCandidates: number,
  ): Promise<SearchChannelHit[]> {
    const documents = (await this.collection
      .aggregate([
        {
          $vectorSearch: {
            index,
            path: "embedding.values",
            queryVector: [...vector],
            numCandidates,
            limit,
            filter: {
              active: true,
              visibilityScope,
              knownPathStatus: { $in: [...statuses] },
              "embedding.modelIdentifier": modelIdentifier,
              "embedding.modelVersion": modelVersion,
              "embedding.dimensions": dimensions,
            },
          },
        },
        { $set: { _channelScore: { $meta: "vectorSearchScore" } } },
      ])
      .toArray()) as Array<KnownPathSearchDocument & { _channelScore?: number }>;
    return documents.map(({ _channelScore = 0, ...document }) => ({
      document: knownPathSearchDocumentSchema.parse(document),
      score: _channelScore,
    }));
  }

  public async createAtlasIndexes(
    definitions: readonly {
      name: string;
      type?: "search" | "vectorSearch";
      definition: Record<string, unknown>;
    }[],
  ): Promise<string[]> {
    return this.collection.createSearchIndexes([...definitions]);
  }

  public async listAtlasIndexes(): Promise<Record<string, unknown>[]> {
    return this.collection.listSearchIndexes().toArray() as Promise<Record<string, unknown>[]>;
  }
}

export class AgentContributionRepository
  extends MongoEntityRepository<AgentContribution, AgentContributionId>
  implements EntityRepository<AgentContribution, AgentContributionId>
{
  public constructor(collection: Collection<AgentContribution>) {
    super(collection, agentContributionSchema);
  }

  public async findByDeduplicationKey(key: VersionedKey): Promise<AgentContribution | null> {
    return this.findOne({ "deduplicationKey.value": key.value });
  }

  public async updateStatus(
    id: AgentContributionId,
    status: AgentContribution["status"],
  ): Promise<AgentContribution | null> {
    return this.updateOne({ _id: id }, { status });
  }
}

export class AgentOutcomeRepository
  extends MongoEntityRepository<AgentOutcome, AgentOutcomeId>
  implements EntityRepository<AgentOutcome, AgentOutcomeId>
{
  public constructor(collection: Collection<AgentOutcome>) {
    super(collection, agentOutcomeSchema);
  }

  public async findByDeduplicationKey(key: VersionedKey): Promise<AgentOutcome | null> {
    return this.findOne({ "deduplicationKey.value": key.value });
  }
}

export interface KnownPathRepositories {
  readonly agentContributions: AgentContributionRepository;
  readonly agentOutcomes: AgentOutcomeRepository;
  readonly apiKeys: ApiKeyRepository;
  readonly auditEvents: AuditEventRepository;
  readonly candidateAssessments: CandidateAssessmentRepository;
  readonly candidateEmbeddings: CandidateEmbeddingRepository;
  readonly candidateExperiences: CandidateExperienceRepository;
  readonly candidatePairAssessments: CandidatePairAssessmentRepository;
  readonly candidateSimilarityProfiles: CandidateSimilarityProfileRepository;
  readonly canonicalMemberships: CanonicalMembershipRepository;
  readonly canonicalizationEvents: CanonicalizationEventRepository;
  readonly extractionAttempts: ExtractionAttemptRepository;
  readonly ingestionRuns: IngestionRunRepository;
  readonly knownPaths: KnownPathRepository;
  readonly knownPathRevisions: KnownPathRevisionRepository;
  readonly knownPathSearchDocuments: KnownPathSearchDocumentRepository;
  readonly knowledgeSearchEvents: KnowledgeSearchEventRepository;
  readonly sourceItems: SourceItemRepository;
  readonly sourceItemStates: SourceItemStateRepository;
  readonly sourceRegistries: SourceRegistryRepository;
  readonly users: UserRepository;
}

export function createRepositories(collections: KnownPathCollections): KnownPathRepositories {
  return {
    agentContributions: new AgentContributionRepository(collections.agentContributions),
    agentOutcomes: new AgentOutcomeRepository(collections.agentOutcomes),
    apiKeys: new ApiKeyRepository(collections.apiKeys),
    auditEvents: new AuditEventRepository(collections.auditEvents),
    candidateAssessments: new CandidateAssessmentRepository(collections.candidateAssessments),
    candidateEmbeddings: new CandidateEmbeddingRepository(collections.candidateEmbeddings),
    candidateExperiences: new CandidateExperienceRepository(collections.candidateExperiences),
    candidatePairAssessments: new CandidatePairAssessmentRepository(
      collections.candidatePairAssessments,
    ),
    candidateSimilarityProfiles: new CandidateSimilarityProfileRepository(
      collections.candidateSimilarityProfiles,
    ),
    canonicalMemberships: new CanonicalMembershipRepository(collections.canonicalMemberships),
    canonicalizationEvents: new CanonicalizationEventRepository(collections.canonicalizationEvents),
    extractionAttempts: new ExtractionAttemptRepository(collections.extractionAttempts),
    ingestionRuns: new IngestionRunRepository(collections.ingestionRuns),
    knownPaths: new KnownPathRepository(collections.knownPaths),
    knownPathRevisions: new KnownPathRevisionRepository(collections.knownPathRevisions),
    knownPathSearchDocuments: new KnownPathSearchDocumentRepository(
      collections.knownPathSearchDocuments,
    ),
    knowledgeSearchEvents: new KnowledgeSearchEventRepository(collections.knowledgeSearchEvents),
    sourceItems: new SourceItemRepository(collections.sourceItems),
    sourceItemStates: new SourceItemStateRepository(collections.sourceItemStates),
    sourceRegistries: new SourceRegistryRepository(collections.sourceRegistries),
    users: new UserRepository(collections.users),
  };
}
