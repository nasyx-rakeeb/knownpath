import {
  agentContributionSchema,
  agentOutcomeSchema,
  apiKeySchema,
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

import type { KnownPathCollections } from "./collections.js";

interface StoredEntity {
  readonly _id: string;
  readonly audit: {
    readonly updatedAt: Date;
  };
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
      { $set: { ...update, "audit.updatedAt": new Date() } },
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
    super(collection, userSchema);
  }

  public async findByNormalizedEmail(normalizedEmail: string): Promise<User | null> {
    return this.findOne({ normalizedEmail });
  }

  public async updateStatus(id: UserId, status: User["status"]): Promise<User | null> {
    return this.updateOne({ _id: id }, { status });
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
    candidateExperiences: new CandidateExperienceRepository(collections.candidateExperiences),
    ingestionRuns: new IngestionRunRepository(collections.ingestionRuns),
    knownPaths: new KnownPathRepository(collections.knownPaths),
    sourceItems: new SourceItemRepository(collections.sourceItems),
    sourceRegistries: new SourceRegistryRepository(collections.sourceRegistries),
    users: new UserRepository(collections.users),
  };
}
