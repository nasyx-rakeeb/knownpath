import {
  agentContributionSchema,
  agentOutcomeSchema,
  agentOutcomeV2Schema,
  outcomeAssessmentSchema,
  safetyEventSchema,
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
  pipelineRunSchema,
  pipelineStepSchema,
  sourceItemSchema,
  sourceItemStateSchema,
  sourceRegistrySchema,
  userSchema,
  workerHeartbeatSchema,
  type AgentContribution,
  type AgentContributionV2,
  type AgentContributionId,
  type AgentOutcome,
  type AgentOutcomeV2,
  type AgentOutcomeId,
  type OutcomeAssessment,
  type OutcomeAssessmentId,
  type SafetyEvent,
  type SafetyEventId,
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
  type PipelineRun,
  type PipelineRunId,
  type PipelineStep,
  type PipelineStepId,
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
  type WorkerHeartbeat,
  type WorkerHeartbeatId,
} from "@knownpath/domain";
import type {
  Collection,
  Filter,
  MatchKeysAndValues,
  OptionalUnlessRequiredId,
  WithId,
} from "mongodb";
import { MongoServerError } from "mongodb";

import type { AuthSessionRecord, KnownPathCollections } from "./collections.js";

interface StoredEntity {
  readonly _id: string;
}

export interface AdminPageOptions {
  readonly before?: { readonly at: Date; readonly id: string };
  readonly limit: number;
  readonly search?: string;
  readonly status?: string;
}

function adminBoundary(before: AdminPageOptions["before"], datePath = "audit.createdAt") {
  return before === undefined
    ? {}
    : {
        $or: [
          { [datePath]: { $lt: before.at } },
          { [datePath]: before.at, _id: { $lt: before.id } },
        ],
      };
}

function adminSearch(search: string | undefined, paths: readonly string[]) {
  if (search === undefined) return {};
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return { $or: paths.map((path) => ({ [path]: { $regex: escaped, $options: "i" } })) };
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

  public async count(filter: Filter<Entity> = {} as Filter<Entity>): Promise<number> {
    return this.collection.countDocuments(filter);
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

  public async updateContributionMode(
    id: UserId,
    contributionMode: User["contributionMode"],
  ): Promise<User | null> {
    return this.updateOne({ _id: id }, { contributionMode });
  }

  public async updateDisplayName(id: UserId, displayName: string): Promise<User | null> {
    return this.updateOne({ _id: id }, { displayName });
  }

  public async listAdmin(options: AdminPageOptions): Promise<User[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { status: options.status }),
        ...adminSearch(options.search, ["displayName", "email"]),
        ...adminBoundary(options.before, "createdAt"),
      } as Filter<User>)
      .sort({ createdAt: -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => userSchema.parse(value));
  }

  public async updateStatusIfCurrent(
    id: UserId,
    expected: User["status"],
    status: User["status"],
  ): Promise<User | null> {
    return this.updateOne({ _id: id, status: expected }, { status });
  }
}

export class AuditEventRepository
  extends MongoEntityRepository<AuditEvent, AuditEventId>
  implements EntityRepository<AuditEvent, AuditEventId>
{
  public constructor(collection: Collection<AuditEvent>) {
    super(collection, auditEventSchema, "occurredAt");
  }

  public async listAdmin(options: AdminPageOptions): Promise<AuditEvent[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { eventType: options.status }),
        ...adminSearch(options.search, ["eventType", "target.id", "requestId"]),
        ...adminBoundary(options.before, "occurredAt"),
      } as Filter<AuditEvent>)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => auditEventSchema.parse(value));
  }
}

export class AuthSessionRepository {
  public constructor(private readonly collection: Collection<AuthSessionRecord>) {}

  public async listActiveByUserId(userId: UserId, now: Date): Promise<AuthSessionRecord[]> {
    return this.collection
      .find({ userId, expiresAt: { $gt: now } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .toArray();
  }

  public async revokeOwned(id: string, userId: UserId): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id, userId });
    return result.deletedCount === 1;
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

  public async createIfAbsent(entity: SourceRegistry): Promise<SourceRegistry | null> {
    const parsed = sourceRegistrySchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
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

  public async listAdmin(options: AdminPageOptions): Promise<SourceRegistry[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { enabled: options.status === "enabled" }),
        ...adminSearch(options.search, ["name", "canonicalUrl", "originalUrl"]),
        ...adminBoundary(options.before),
      } as Filter<SourceRegistry>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => sourceRegistrySchema.parse(value));
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
    capturedSince?: Date,
  ): Promise<SourceItem[]> {
    const match: Filter<SourceItem> = {
      itemType: { $in: ["issue", "discussion", "documentation_page", "release_note"] },
      ...(sourceRegistryId === undefined ? {} : { sourceRegistryId }),
      ...(capturedSince === undefined ? {} : { capturedAt: { $gte: capturedSince } }),
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

  public async listAdmin(options: AdminPageOptions): Promise<SourceItem[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { itemType: options.status }),
        ...adminSearch(options.search, [
          "title",
          "provenance.canonicalUrl",
          "provenance.sourceItemIdentity",
        ]),
        ...adminBoundary(options.before),
      } as Filter<SourceItem>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => sourceItemSchema.parse(value));
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

  public async listAdmin(options: AdminPageOptions): Promise<ExtractionAttempt[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { status: options.status }),
        ...adminSearch(options.search, ["sourceItemId", "model.name", "failure.message"]),
        ...adminBoundary(options.before),
      } as Filter<ExtractionAttempt>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => extractionAttemptSchema.parse(value));
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

  public async listAdmin(options: AdminPageOptions): Promise<CandidateExperience[]> {
    const search =
      options.search === undefined
        ? {}
        : {
            $and: [
              { "visibility.scope": { $ne: "private" } },
              adminSearch(options.search, ["problemStatement", "solutionSummary", "sourceItemId"]),
            ],
          };
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { status: options.status }),
        ...search,
        ...adminBoundary(options.before),
      } as Filter<CandidateExperience>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => candidateExperienceSchema.parse(value));
  }

  public async updateModerationIfCurrent(
    id: CandidateExperienceId,
    expectedStatus: CandidateExperience["moderation"]["status"],
    moderation: CandidateExperience["moderation"],
  ): Promise<CandidateExperience | null> {
    return this.updateOne({ _id: id, "moderation.status": expectedStatus }, { moderation });
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

  public async updateOutcomeAssessment(
    id: KnownPathId,
    assessmentId: OutcomeAssessmentId,
    calculatedAt: Date,
  ): Promise<KnownPath | null> {
    return this.updateOne(
      {
        _id: id,
        $or: [
          { latestOutcomeAssessedAt: { $exists: false } },
          { latestOutcomeAssessedAt: { $lte: calculatedAt } },
        ],
      },
      { latestOutcomeAssessmentId: assessmentId, latestOutcomeAssessedAt: calculatedAt },
    );
  }

  public async queueSafetyReview(
    id: KnownPathId,
    eventId: SafetyEventId,
    occurredAt: Date,
  ): Promise<KnownPath | null> {
    const existing = await this.findById(id);
    if (existing === null) return null;
    return this.updateOne(
      { _id: id },
      {
        safetyReview: {
          status: "review_queued",
          firstQueuedAt: existing.safetyReview.firstQueuedAt ?? occurredAt,
          latestEventAt: occurredAt,
          latestSafetyEventId: eventId,
        },
      },
    );
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

  public async listForOutcomeAssessment(limit = 100): Promise<KnownPath[]> {
    const documents = await this.collection
      .find({
        status: { $in: ["review", "published", "deprecated"] },
        latestRevisionId: { $exists: true },
      })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => knownPathSchema.parse(document));
  }

  public async listAdmin(options: AdminPageOptions): Promise<KnownPath[]> {
    const search =
      options.search === undefined
        ? {}
        : {
            $and: [
              { "visibility.scope": { $ne: "private" } },
              adminSearch(options.search, ["title", "problemSummary", "metadata.packages.name"]),
            ],
          };
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { status: options.status }),
        ...search,
        ...adminBoundary(options.before),
      } as Filter<KnownPath>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => knownPathSchema.parse(value));
  }

  public async updateStatusIfCurrent(
    id: KnownPathId,
    expected: KnownPath["status"],
    status: KnownPath["status"],
  ): Promise<KnownPath | null> {
    return this.updateOne({ _id: id, status: expected }, { status });
  }

  public async updateSafetyReviewIfCurrent(
    id: KnownPathId,
    expected: KnownPath["safetyReview"]["status"],
    safetyReview: KnownPath["safetyReview"],
  ): Promise<KnownPath | null> {
    return this.updateOne({ _id: id, "safetyReview.status": expected }, { safetyReview });
  }

  public async moderateIfCurrent(
    id: KnownPathId,
    expected: KnownPath["status"],
    values: Pick<KnownPath, "moderation" | "safetyReview" | "status">,
  ): Promise<KnownPath | null> {
    return this.updateOne({ _id: id, status: expected }, values);
  }
}

export class KnowledgeSearchEventRepository
  extends MongoEntityRepository<KnowledgeSearchEvent, KnowledgeSearchEventId>
  implements EntityRepository<KnowledgeSearchEvent, KnowledgeSearchEventId>
{
  public constructor(collection: Collection<KnowledgeSearchEvent>) {
    super(collection, knowledgeSearchEventSchema);
  }

  public async listByUserId(
    userId: UserId,
    before: { readonly createdAt: Date; readonly id: KnowledgeSearchEventId } | undefined,
    limit: number,
  ): Promise<KnowledgeSearchEvent[]> {
    const boundary =
      before === undefined
        ? {}
        : {
            $or: [
              { createdAt: { $lt: before.createdAt } },
              { createdAt: before.createdAt, _id: { $lt: before.id } },
            ],
          };
    const documents = await this.collection
      .find({ "principal.userId": userId, ...boundary } as Filter<KnowledgeSearchEvent>)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => knowledgeSearchEventSchema.parse(document));
  }

  public async summarizeByUserSince(
    userId: UserId,
    since: Date,
  ): Promise<{ readonly selected: number; readonly total: number }> {
    const rows = await this.collection
      .aggregate<{ selected: number; total: number }>([
        { $match: { "principal.userId": userId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            selected: { $sum: { $cond: [{ $ne: [{ $type: "$selected" }, "missing"] }, 1, 0] } },
          },
        },
        { $project: { _id: 0, selected: 1, total: 1 } },
      ])
      .toArray();
    return rows[0] ?? { selected: 0, total: 0 };
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

  public async findV2ByOwnerAndClientSubmissionId(
    userId: UserId,
    clientSubmissionId: string,
  ): Promise<AgentContributionV2 | null> {
    const result = await this.findOne({
      schemaVersion: 2,
      "contributor.userId": userId,
      clientSubmissionId,
    } as Filter<AgentContribution>);
    return result?.schemaVersion === 2 ? result : null;
  }

  public async createV2IfAbsent(entity: AgentContributionV2): Promise<AgentContributionV2 | null> {
    const parsed = agentContributionSchema.parse(entity);
    if (parsed.schemaVersion !== 2) throw new Error("Expected a version 2 contribution");
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async updateProcessing(
    id: AgentContributionId,
    processing: AgentContributionV2["processing"],
  ): Promise<AgentContributionV2 | null> {
    const result = await this.updateOne(
      { _id: id, schemaVersion: 2 } as Filter<AgentContribution>,
      { processing } as MatchKeysAndValues<AgentContribution>,
    );
    return result?.schemaVersion === 2 ? result : null;
  }

  public async listV2Pending(limit: number): Promise<AgentContributionV2[]> {
    const documents = await this.collection
      .find({
        schemaVersion: 2,
        status: "pending",
        "processing.stage": { $nin: ["complete"] },
      } as Filter<AgentContribution>)
      .sort({ "audit.createdAt": 1, _id: 1 })
      .limit(limit)
      .toArray();
    return documents.flatMap((document) => {
      const parsed = agentContributionSchema.parse(document);
      return parsed.schemaVersion === 2 ? [parsed] : [];
    });
  }

  public async listV2ByOwner(
    userId: UserId,
    options: {
      readonly before?: { readonly createdAt: Date; readonly id: AgentContributionId };
      readonly limit: number;
      readonly status?: AgentContributionV2["status"];
      readonly visibility?: "public" | "private";
    },
  ): Promise<AgentContributionV2[]> {
    const boundary =
      options.before === undefined
        ? {}
        : {
            $or: [
              { "audit.createdAt": { $lt: options.before.createdAt } },
              { "audit.createdAt": options.before.createdAt, _id: { $lt: options.before.id } },
            ],
          };
    const documents = await this.collection
      .find({
        schemaVersion: 2,
        "contributor.userId": userId,
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(options.visibility === undefined ? {} : { "visibility.scope": options.visibility }),
        ...boundary,
      } as Filter<AgentContribution>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return documents.flatMap((document) => {
      const parsed = agentContributionSchema.parse(document);
      return parsed.schemaVersion === 2 ? [parsed] : [];
    });
  }

  public async summarizeV2ByOwnerSince(
    userId: UserId,
    since: Date,
  ): Promise<{
    readonly complete: number;
    readonly pending: number;
    readonly private: number;
    readonly public: number;
    readonly quarantined: number;
    readonly total: number;
    readonly withAssessment: number;
    readonly withCandidate: number;
  }> {
    const rows = await this.collection
      .aggregate<{
        complete: number;
        pending: number;
        private: number;
        public: number;
        quarantined: number;
        total: number;
        withAssessment: number;
        withCandidate: number;
      }>([
        {
          $match: {
            schemaVersion: 2,
            "contributor.userId": userId,
            "audit.createdAt": { $gte: since },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            public: { $sum: { $cond: [{ $eq: ["$visibility.scope", "public"] }, 1, 0] } },
            private: { $sum: { $cond: [{ $eq: ["$visibility.scope", "private"] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            quarantined: { $sum: { $cond: [{ $eq: ["$status", "quarantined"] }, 1, 0] } },
            complete: {
              $sum: { $cond: [{ $eq: ["$processing.stage", "complete"] }, 1, 0] },
            },
            withCandidate: {
              $sum: {
                $cond: [{ $ne: [{ $type: "$processing.candidateExperienceId" }, "missing"] }, 1, 0],
              },
            },
            withAssessment: {
              $sum: {
                $cond: [{ $ne: [{ $type: "$processing.assessmentId" }, "missing"] }, 1, 0],
              },
            },
          },
        },
        { $project: { _id: 0 } },
      ])
      .toArray();
    return (
      rows[0] ?? {
        complete: 0,
        pending: 0,
        private: 0,
        public: 0,
        quarantined: 0,
        total: 0,
        withAssessment: 0,
        withCandidate: 0,
      }
    );
  }

  public async updateStatus(
    id: AgentContributionId,
    status: AgentContribution["status"],
  ): Promise<AgentContribution | null> {
    return this.updateOne({ _id: id }, { status });
  }

  public async listAdmin(options: AdminPageOptions): Promise<AgentContribution[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { status: options.status }),
        // Searching private lesson text would disclose content through a side channel before the
        // separately authorized reveal operation. Restrict contribution search to identifiers.
        ...adminSearch(options.search, ["_id", "processing.candidateExperienceId"]),
        ...adminBoundary(options.before),
      } as Filter<AgentContribution>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => agentContributionSchema.parse(value));
  }

  public async updateModerationIfCurrent(
    id: AgentContributionId,
    expectedStatus: AgentContribution["moderation"]["status"],
    moderation: AgentContribution["moderation"],
    status?: AgentContribution["status"],
  ): Promise<AgentContribution | null> {
    return this.updateOne(
      { _id: id, "moderation.status": expectedStatus },
      { moderation, ...(status === undefined ? {} : { status }) },
    );
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

  public async createV2IfAbsent(entity: AgentOutcomeV2): Promise<AgentOutcomeV2 | null> {
    const parsed = agentOutcomeV2Schema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findV2ByClientOutcome(
    userId: UserId,
    clientOutcomeId: string,
  ): Promise<AgentOutcomeV2 | null> {
    const result = await this.findOne({
      schemaVersion: 2,
      "reporter.userId": userId,
      clientOutcomeId,
    } as Filter<AgentOutcome>);
    return result?.schemaVersion === 2 ? result : null;
  }

  public async findV2ByExecution(
    userId: UserId,
    knownPathId: KnownPathId,
    clientExecutionId: string,
  ): Promise<AgentOutcomeV2 | null> {
    const result = await this.findOne({
      schemaVersion: 2,
      "reporter.userId": userId,
      knownPathId,
      clientExecutionId,
    } as Filter<AgentOutcome>);
    return result?.schemaVersion === 2 ? result : null;
  }

  public async listV2ByKnownPath(
    knownPathId: KnownPathId,
    limit = 10_000,
  ): Promise<AgentOutcomeV2[]> {
    const documents = await this.collection
      .find({ schemaVersion: 2, knownPathId } as Filter<AgentOutcome>)
      .sort({ receivedAt: 1, _id: 1 })
      .limit(limit)
      .toArray();
    return documents.flatMap((document) => {
      const parsed = agentOutcomeSchema.parse(document);
      return parsed.schemaVersion === 2 ? [parsed] : [];
    });
  }

  public async listV2ByOwner(
    userId: UserId,
    options: {
      readonly before?: { readonly id: AgentOutcomeId; readonly receivedAt: Date };
      readonly limit: number;
      readonly outcome?: AgentOutcomeV2["outcome"];
    },
  ): Promise<AgentOutcomeV2[]> {
    const boundary =
      options.before === undefined
        ? {}
        : {
            $or: [
              { receivedAt: { $lt: options.before.receivedAt } },
              { receivedAt: options.before.receivedAt, _id: { $lt: options.before.id } },
            ],
          };
    const documents = await this.collection
      .find({
        schemaVersion: 2,
        "reporter.userId": userId,
        ...(options.outcome === undefined ? {} : { outcome: options.outcome }),
        ...boundary,
      } as Filter<AgentOutcome>)
      .sort({ receivedAt: -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return documents.flatMap((document) => {
      const parsed = agentOutcomeSchema.parse(document);
      return parsed.schemaVersion === 2 ? [parsed] : [];
    });
  }

  public async summarizeV2ByOwnerSince(
    userId: UserId,
    since: Date,
  ): Promise<{
    readonly attemptedFailed: number;
    readonly incompatibleEnvironment: number;
    readonly misleadingOrUnsafe: number;
    readonly notUsed: number;
    readonly partiallyHelped: number;
    readonly solved: number;
    readonly staleOrOutdated: number;
    readonly total: number;
  }> {
    const rows = await this.collection
      .aggregate<{
        attemptedFailed: number;
        incompatibleEnvironment: number;
        misleadingOrUnsafe: number;
        notUsed: number;
        partiallyHelped: number;
        solved: number;
        staleOrOutdated: number;
        total: number;
      }>([
        { $match: { schemaVersion: 2, "reporter.userId": userId, receivedAt: { $gte: since } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            solved: { $sum: { $cond: [{ $eq: ["$outcome", "solved"] }, 1, 0] } },
            partiallyHelped: {
              $sum: { $cond: [{ $eq: ["$outcome", "partially_helped"] }, 1, 0] },
            },
            attemptedFailed: {
              $sum: { $cond: [{ $eq: ["$outcome", "attempted_failed"] }, 1, 0] },
            },
            incompatibleEnvironment: {
              $sum: { $cond: [{ $eq: ["$outcome", "incompatible_environment"] }, 1, 0] },
            },
            staleOrOutdated: {
              $sum: { $cond: [{ $eq: ["$outcome", "stale_or_outdated"] }, 1, 0] },
            },
            misleadingOrUnsafe: {
              $sum: { $cond: [{ $eq: ["$outcome", "misleading_or_unsafe"] }, 1, 0] },
            },
            notUsed: { $sum: { $cond: [{ $eq: ["$outcome", "not_used"] }, 1, 0] } },
          },
        },
        { $project: { _id: 0 } },
      ])
      .toArray();
    return (
      rows[0] ?? {
        attemptedFailed: 0,
        incompatibleEnvironment: 0,
        misleadingOrUnsafe: 0,
        notUsed: 0,
        partiallyHelped: 0,
        solved: 0,
        staleOrOutdated: 0,
        total: 0,
      }
    );
  }

  public async countRecentByApiKey(apiKeyId: ApiKeyId, since: Date): Promise<number> {
    return this.collection.countDocuments({
      schemaVersion: 2,
      "reporter.apiKeyId": apiKeyId,
      receivedAt: { $gte: since },
    } as Filter<AgentOutcome>);
  }

  public async countRecentByUser(userId: UserId, since: Date): Promise<number> {
    return this.collection.countDocuments({
      schemaVersion: 2,
      "reporter.userId": userId,
      receivedAt: { $gte: since },
    } as Filter<AgentOutcome>);
  }

  public async listAdmin(options: AdminPageOptions): Promise<AgentOutcome[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { outcome: options.status }),
        ...adminSearch(options.search, ["knownPathId", "outcome", "note"]),
        ...adminBoundary(options.before, "receivedAt"),
      } as Filter<AgentOutcome>)
      .sort({ receivedAt: -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => agentOutcomeSchema.parse(value));
  }
}

export class OutcomeAssessmentRepository extends MongoEntityRepository<
  OutcomeAssessment,
  OutcomeAssessmentId
> {
  public constructor(collection: Collection<OutcomeAssessment>) {
    super(collection, outcomeAssessmentSchema);
  }
  public async createIfAbsent(entity: OutcomeAssessment): Promise<OutcomeAssessment | null> {
    const parsed = outcomeAssessmentSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }
  public async findByIdempotencyKey(key: VersionedKey): Promise<OutcomeAssessment | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }
  public async findManyByIds(ids: readonly OutcomeAssessmentId[]): Promise<OutcomeAssessment[]> {
    if (ids.length === 0) return [];
    const values = await this.collection.find({ _id: { $in: [...ids] } }).toArray();
    return values.map((value) => outcomeAssessmentSchema.parse(value));
  }
  public async listByKnownPath(
    knownPathId: KnownPathId,
    limit = 100,
  ): Promise<OutcomeAssessment[]> {
    const values = await this.collection
      .find({ knownPathId })
      .sort({ calculatedAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return values.map((value) => outcomeAssessmentSchema.parse(value));
  }
}

export class SafetyEventRepository extends MongoEntityRepository<SafetyEvent, SafetyEventId> {
  public constructor(collection: Collection<SafetyEvent>) {
    super(collection, safetyEventSchema);
  }

  public async listBySourceOutcomeIds(
    outcomeIds: readonly AgentOutcomeId[],
  ): Promise<SafetyEvent[]> {
    if (outcomeIds.length === 0) return [];
    const documents = await this.collection
      .find({ sourceOutcomeId: { $in: [...outcomeIds] } })
      .toArray();
    return documents.map((document) => safetyEventSchema.parse(document));
  }
  public async createIfAbsent(entity: SafetyEvent): Promise<SafetyEvent | null> {
    const parsed = safetyEventSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }
  public async findByIdempotencyKey(key: VersionedKey): Promise<SafetyEvent | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }
  public async listByKnownPath(knownPathId: KnownPathId, limit = 100): Promise<SafetyEvent[]> {
    const values = await this.collection
      .find({ knownPathId })
      .sort({ occurredAt: -1, _id: -1 })
      .limit(limit)
      .toArray();
    return values.map((value) => safetyEventSchema.parse(value));
  }
}

export class PipelineRunRepository extends MongoEntityRepository<PipelineRun, PipelineRunId> {
  public constructor(collection: Collection<PipelineRun>) {
    super(collection, pipelineRunSchema);
  }

  public async list(status?: PipelineRun["status"], limit = 100): Promise<PipelineRun[]> {
    const filter = status === undefined ? {} : { status };
    const values = await this.collection
      .find(filter)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(limit)
      .toArray();
    return values.map((value) => pipelineRunSchema.parse(value));
  }

  public async updateState(
    id: PipelineRunId,
    values: Partial<
      Pick<PipelineRun, "status" | "counters" | "startedAt" | "completedAt" | "lastError">
    >,
  ): Promise<PipelineRun | null> {
    return this.updateOne({ _id: id }, values as MatchKeysAndValues<PipelineRun>);
  }

  public async listAdmin(options: AdminPageOptions): Promise<PipelineRun[]> {
    const values = await this.collection
      .find({
        ...(options.status === undefined ? {} : { status: options.status }),
        ...adminSearch(options.search, ["target.id", "kind", "lastError.message"]),
        ...adminBoundary(options.before),
      } as Filter<PipelineRun>)
      .sort({ "audit.createdAt": -1, _id: -1 })
      .limit(options.limit)
      .toArray();
    return values.map((value) => pipelineRunSchema.parse(value));
  }
}

export class PipelineStepRepository extends MongoEntityRepository<PipelineStep, PipelineStepId> {
  public constructor(collection: Collection<PipelineStep>) {
    super(collection, pipelineStepSchema);
  }

  public async createIfAbsent(entity: PipelineStep): Promise<PipelineStep | null> {
    const parsed = pipelineStepSchema.parse(entity);
    try {
      await this.collection.insertOne(parsed);
      return parsed;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) return null;
      throw error;
    }
  }

  public async findByIdempotencyKey(key: VersionedKey): Promise<PipelineStep | null> {
    return this.findOne({ "idempotencyKey.value": key.value });
  }

  public async findByBullmqJobId(jobId: string): Promise<PipelineStep | null> {
    return this.findOne({ bullmqJobId: jobId });
  }

  public async listPendingDispatch(limit = 100): Promise<PipelineStep[]> {
    const values = await this.collection
      .find({ status: "pending_dispatch" })
      .sort({ "audit.createdAt": 1, _id: 1 })
      .limit(limit)
      .toArray();
    return values.map((value) => pipelineStepSchema.parse(value));
  }

  public async listByRun(runId: PipelineRunId, limit = 1_000): Promise<PipelineStep[]> {
    const values = await this.collection
      .find({ pipelineRunId: runId })
      .sort({ "audit.createdAt": 1, _id: 1 })
      .limit(limit)
      .toArray();
    return values.map((value) => pipelineStepSchema.parse(value));
  }

  public async updateState(
    id: PipelineStepId,
    values: Partial<
      Pick<
        PipelineStep,
        | "status"
        | "attemptsMade"
        | "dispatchedAt"
        | "startedAt"
        | "completedAt"
        | "lastError"
        | "quarantineReason"
      >
    >,
  ): Promise<PipelineStep | null> {
    return this.updateOne({ _id: id }, values as MatchKeysAndValues<PipelineStep>);
  }
}

export class WorkerHeartbeatRepository extends MongoEntityRepository<
  WorkerHeartbeat,
  WorkerHeartbeatId
> {
  public constructor(collection: Collection<WorkerHeartbeat>) {
    super(collection, workerHeartbeatSchema);
  }

  public async upsert(entity: WorkerHeartbeat): Promise<WorkerHeartbeat> {
    const parsed = workerHeartbeatSchema.parse(entity);
    await this.collection.replaceOne({ _id: parsed._id }, parsed, { upsert: true });
    return parsed;
  }

  public async listRecent(since: Date, limit = 100): Promise<WorkerHeartbeat[]> {
    const values = await this.collection
      .find({ lastHeartbeatAt: { $gte: since } })
      .sort({ lastHeartbeatAt: -1 })
      .limit(limit)
      .toArray();
    return values.map((value) => workerHeartbeatSchema.parse(value));
  }
}

export interface KnownPathRepositories {
  readonly agentContributions: AgentContributionRepository;
  readonly agentOutcomes: AgentOutcomeRepository;
  readonly outcomeAssessments: OutcomeAssessmentRepository;
  readonly safetyEvents: SafetyEventRepository;
  readonly apiKeys: ApiKeyRepository;
  readonly auditEvents: AuditEventRepository;
  readonly authSessions: AuthSessionRepository;
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
  readonly pipelineRuns: PipelineRunRepository;
  readonly pipelineSteps: PipelineStepRepository;
  readonly sourceItems: SourceItemRepository;
  readonly sourceItemStates: SourceItemStateRepository;
  readonly sourceRegistries: SourceRegistryRepository;
  readonly users: UserRepository;
  readonly workerHeartbeats: WorkerHeartbeatRepository;
}

export function createRepositories(collections: KnownPathCollections): KnownPathRepositories {
  return {
    agentContributions: new AgentContributionRepository(collections.agentContributions),
    agentOutcomes: new AgentOutcomeRepository(collections.agentOutcomes),
    outcomeAssessments: new OutcomeAssessmentRepository(collections.outcomeAssessments),
    safetyEvents: new SafetyEventRepository(collections.safetyEvents),
    apiKeys: new ApiKeyRepository(collections.apiKeys),
    auditEvents: new AuditEventRepository(collections.auditEvents),
    authSessions: new AuthSessionRepository(collections.authSessions),
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
    pipelineRuns: new PipelineRunRepository(collections.pipelineRuns),
    pipelineSteps: new PipelineStepRepository(collections.pipelineSteps),
    sourceItems: new SourceItemRepository(collections.sourceItems),
    sourceItemStates: new SourceItemStateRepository(collections.sourceItemStates),
    sourceRegistries: new SourceRegistryRepository(collections.sourceRegistries),
    users: new UserRepository(collections.users),
    workerHeartbeats: new WorkerHeartbeatRepository(collections.workerHeartbeats),
  };
}
