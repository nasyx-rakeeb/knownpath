import {
  agentContributionSchema,
  agentOutcomeSchema,
  apiKeySchema,
  auditEventSchema,
  candidateExperienceSchema,
  ingestionRunSchema,
  knownPathSchema,
  sourceItemSchema,
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
  type CandidateExperience,
  type CandidateExperienceId,
  type IngestionRun,
  type IngestionRunId,
  type KnownPath,
  type KnownPathId,
  type SourceItem,
  type SourceItemId,
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

  public async updateStatus(
    id: CandidateExperienceId,
    status: CandidateExperience["status"],
  ): Promise<CandidateExperience | null> {
    return this.updateOne({ _id: id }, { status });
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
  readonly candidateExperiences: CandidateExperienceRepository;
  readonly ingestionRuns: IngestionRunRepository;
  readonly knownPaths: KnownPathRepository;
  readonly sourceItems: SourceItemRepository;
  readonly sourceRegistries: SourceRegistryRepository;
  readonly users: UserRepository;
}

export function createRepositories(collections: KnownPathCollections): KnownPathRepositories {
  return {
    agentContributions: new AgentContributionRepository(collections.agentContributions),
    agentOutcomes: new AgentOutcomeRepository(collections.agentOutcomes),
    apiKeys: new ApiKeyRepository(collections.apiKeys),
    auditEvents: new AuditEventRepository(collections.auditEvents),
    candidateExperiences: new CandidateExperienceRepository(collections.candidateExperiences),
    ingestionRuns: new IngestionRunRepository(collections.ingestionRuns),
    knownPaths: new KnownPathRepository(collections.knownPaths),
    sourceItems: new SourceItemRepository(collections.sourceItems),
    sourceRegistries: new SourceRegistryRepository(collections.sourceRegistries),
    users: new UserRepository(collections.users),
  };
}
