import {
  agentContributionSchema,
  agentOutcomeSchema,
  apiKeySchema,
  auditEventSchema,
  candidateAssessmentSchema,
  candidateExperienceSchema,
  extractionAttemptSchema,
  ingestionRunSchema,
  knownPathSchema,
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
  type CandidateExperience,
  type CandidateExperienceId,
  type ExtractionAttempt,
  type ExtractionAttemptId,
  type IngestionRun,
  type IngestionRunId,
  type KnownPath,
  type KnownPathId,
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

  public async updateStatus(
    id: KnownPathId,
    status: KnownPath["status"],
  ): Promise<KnownPath | null> {
    return this.updateOne({ _id: id }, { status });
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
  readonly candidateExperiences: CandidateExperienceRepository;
  readonly extractionAttempts: ExtractionAttemptRepository;
  readonly ingestionRuns: IngestionRunRepository;
  readonly knownPaths: KnownPathRepository;
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
    candidateExperiences: new CandidateExperienceRepository(collections.candidateExperiences),
    extractionAttempts: new ExtractionAttemptRepository(collections.extractionAttempts),
    ingestionRuns: new IngestionRunRepository(collections.ingestionRuns),
    knownPaths: new KnownPathRepository(collections.knownPaths),
    sourceItems: new SourceItemRepository(collections.sourceItems),
    sourceItemStates: new SourceItemStateRepository(collections.sourceItemStates),
    sourceRegistries: new SourceRegistryRepository(collections.sourceRegistries),
    users: new UserRepository(collections.users),
  };
}
