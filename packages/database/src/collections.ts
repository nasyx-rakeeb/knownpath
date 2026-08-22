import type {
  AgentContribution,
  AgentOutcome,
  ApiKey,
  AuditEvent,
  CandidateAssessment,
  CandidateExperience,
  ExtractionAttempt,
  IngestionRun,
  KnownPath,
  SourceItem,
  SourceItemState,
  SourceRegistry,
  User,
} from "@knownpath/domain";
import type { Collection, Db } from "mongodb";

export const collectionNames = {
  agentContributions: "agent_contributions",
  agentOutcomes: "agent_outcomes",
  apiKeys: "api_keys",
  auditEvents: "audit_events",
  authAccounts: "auth_accounts",
  authSessions: "auth_sessions",
  authVerifications: "auth_verifications",
  candidateExperiences: "candidate_experiences",
  candidateAssessments: "candidate_assessments",
  extractionAttempts: "extraction_attempts",
  ingestionRuns: "ingestion_runs",
  knownPaths: "known_paths",
  sourceItems: "source_items",
  sourceItemStates: "source_item_states",
  sourceRegistries: "source_registries",
  users: "users",
} as const;

export interface KnownPathCollections {
  readonly agentContributions: Collection<AgentContribution>;
  readonly agentOutcomes: Collection<AgentOutcome>;
  readonly apiKeys: Collection<ApiKey>;
  readonly auditEvents: Collection<AuditEvent>;
  readonly candidateAssessments: Collection<CandidateAssessment>;
  readonly candidateExperiences: Collection<CandidateExperience>;
  readonly extractionAttempts: Collection<ExtractionAttempt>;
  readonly ingestionRuns: Collection<IngestionRun>;
  readonly knownPaths: Collection<KnownPath>;
  readonly sourceItems: Collection<SourceItem>;
  readonly sourceItemStates: Collection<SourceItemState>;
  readonly sourceRegistries: Collection<SourceRegistry>;
  readonly users: Collection<User>;
}

export function getCollections(database: Db): KnownPathCollections {
  return {
    agentContributions: database.collection<AgentContribution>(collectionNames.agentContributions),
    agentOutcomes: database.collection<AgentOutcome>(collectionNames.agentOutcomes),
    apiKeys: database.collection<ApiKey>(collectionNames.apiKeys),
    auditEvents: database.collection<AuditEvent>(collectionNames.auditEvents),
    candidateAssessments: database.collection<CandidateAssessment>(
      collectionNames.candidateAssessments,
    ),
    candidateExperiences: database.collection<CandidateExperience>(
      collectionNames.candidateExperiences,
    ),
    extractionAttempts: database.collection<ExtractionAttempt>(collectionNames.extractionAttempts),
    ingestionRuns: database.collection<IngestionRun>(collectionNames.ingestionRuns),
    knownPaths: database.collection<KnownPath>(collectionNames.knownPaths),
    sourceItems: database.collection<SourceItem>(collectionNames.sourceItems),
    sourceItemStates: database.collection<SourceItemState>(collectionNames.sourceItemStates),
    sourceRegistries: database.collection<SourceRegistry>(collectionNames.sourceRegistries),
    users: database.collection<User>(collectionNames.users),
  };
}
