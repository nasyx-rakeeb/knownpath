import type {
  AgentContribution,
  AgentOutcome,
  OutcomeAssessment,
  SafetyEvent,
  ApiKey,
  AuditEvent,
  CandidateAssessment,
  CandidateEmbedding,
  CandidateExperience,
  CandidatePairAssessment,
  CandidateSimilarityProfile,
  CanonicalMembership,
  CanonicalizationEvent,
  ExtractionAttempt,
  IngestionRun,
  KnownPath,
  KnowledgeSearchEvent,
  PipelineRun,
  PipelineStep,
  KnownPathSearchDocument,
  KnownPathRevision,
  SourceItem,
  SourceItemState,
  SourceRegistry,
  User,
  WorkerHeartbeat,
} from "@knownpath/domain";
import type { Collection, Db } from "mongodb";

export const collectionNames = {
  agentContributions: "agent_contributions",
  agentOutcomes: "agent_outcomes",
  outcomeAssessments: "known_path_outcome_assessments",
  safetyEvents: "known_path_safety_events",
  apiKeys: "api_keys",
  auditEvents: "audit_events",
  authAccounts: "auth_accounts",
  authSessions: "auth_sessions",
  authVerifications: "auth_verifications",
  candidateExperiences: "candidate_experiences",
  candidateAssessments: "candidate_assessments",
  candidateEmbeddings: "candidate_embeddings",
  candidatePairAssessments: "candidate_pair_assessments",
  candidateSimilarityProfiles: "candidate_similarity_profiles",
  canonicalMemberships: "canonical_memberships",
  canonicalizationEvents: "canonicalization_events",
  extractionAttempts: "extraction_attempts",
  ingestionRuns: "ingestion_runs",
  knownPaths: "known_paths",
  knownPathRevisions: "known_path_revisions",
  knownPathSearchDocuments: "known_path_search_documents",
  knowledgeSearchEvents: "knowledge_search_events",
  pipelineRuns: "pipeline_runs",
  pipelineSteps: "pipeline_steps",
  sourceItems: "source_items",
  sourceItemStates: "source_item_states",
  sourceRegistries: "source_registries",
  users: "users",
  workerHeartbeats: "worker_heartbeats",
} as const;

export interface KnownPathCollections {
  readonly agentContributions: Collection<AgentContribution>;
  readonly agentOutcomes: Collection<AgentOutcome>;
  readonly outcomeAssessments: Collection<OutcomeAssessment>;
  readonly safetyEvents: Collection<SafetyEvent>;
  readonly apiKeys: Collection<ApiKey>;
  readonly auditEvents: Collection<AuditEvent>;
  readonly candidateAssessments: Collection<CandidateAssessment>;
  readonly candidateEmbeddings: Collection<CandidateEmbedding>;
  readonly candidateExperiences: Collection<CandidateExperience>;
  readonly candidatePairAssessments: Collection<CandidatePairAssessment>;
  readonly candidateSimilarityProfiles: Collection<CandidateSimilarityProfile>;
  readonly canonicalMemberships: Collection<CanonicalMembership>;
  readonly canonicalizationEvents: Collection<CanonicalizationEvent>;
  readonly extractionAttempts: Collection<ExtractionAttempt>;
  readonly ingestionRuns: Collection<IngestionRun>;
  readonly knownPaths: Collection<KnownPath>;
  readonly knownPathRevisions: Collection<KnownPathRevision>;
  readonly knownPathSearchDocuments: Collection<KnownPathSearchDocument>;
  readonly knowledgeSearchEvents: Collection<KnowledgeSearchEvent>;
  readonly pipelineRuns: Collection<PipelineRun>;
  readonly pipelineSteps: Collection<PipelineStep>;
  readonly sourceItems: Collection<SourceItem>;
  readonly sourceItemStates: Collection<SourceItemState>;
  readonly sourceRegistries: Collection<SourceRegistry>;
  readonly users: Collection<User>;
  readonly workerHeartbeats: Collection<WorkerHeartbeat>;
}

export function getCollections(database: Db): KnownPathCollections {
  return {
    agentContributions: database.collection<AgentContribution>(collectionNames.agentContributions),
    agentOutcomes: database.collection<AgentOutcome>(collectionNames.agentOutcomes),
    outcomeAssessments: database.collection<OutcomeAssessment>(collectionNames.outcomeAssessments),
    safetyEvents: database.collection<SafetyEvent>(collectionNames.safetyEvents),
    apiKeys: database.collection<ApiKey>(collectionNames.apiKeys),
    auditEvents: database.collection<AuditEvent>(collectionNames.auditEvents),
    candidateAssessments: database.collection<CandidateAssessment>(
      collectionNames.candidateAssessments,
    ),
    candidateEmbeddings: database.collection<CandidateEmbedding>(
      collectionNames.candidateEmbeddings,
    ),
    candidateExperiences: database.collection<CandidateExperience>(
      collectionNames.candidateExperiences,
    ),
    candidatePairAssessments: database.collection<CandidatePairAssessment>(
      collectionNames.candidatePairAssessments,
    ),
    candidateSimilarityProfiles: database.collection<CandidateSimilarityProfile>(
      collectionNames.candidateSimilarityProfiles,
    ),
    canonicalMemberships: database.collection<CanonicalMembership>(
      collectionNames.canonicalMemberships,
    ),
    canonicalizationEvents: database.collection<CanonicalizationEvent>(
      collectionNames.canonicalizationEvents,
    ),
    extractionAttempts: database.collection<ExtractionAttempt>(collectionNames.extractionAttempts),
    ingestionRuns: database.collection<IngestionRun>(collectionNames.ingestionRuns),
    knownPaths: database.collection<KnownPath>(collectionNames.knownPaths),
    knownPathRevisions: database.collection<KnownPathRevision>(collectionNames.knownPathRevisions),
    knownPathSearchDocuments: database.collection<KnownPathSearchDocument>(
      collectionNames.knownPathSearchDocuments,
    ),
    knowledgeSearchEvents: database.collection<KnowledgeSearchEvent>(
      collectionNames.knowledgeSearchEvents,
    ),
    pipelineRuns: database.collection<PipelineRun>(collectionNames.pipelineRuns),
    pipelineSteps: database.collection<PipelineStep>(collectionNames.pipelineSteps),
    sourceItems: database.collection<SourceItem>(collectionNames.sourceItems),
    sourceItemStates: database.collection<SourceItemState>(collectionNames.sourceItemStates),
    sourceRegistries: database.collection<SourceRegistry>(collectionNames.sourceRegistries),
    users: database.collection<User>(collectionNames.users),
    workerHeartbeats: database.collection<WorkerHeartbeat>(collectionNames.workerHeartbeats),
  };
}
