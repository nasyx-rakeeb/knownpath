import type {
  AgentContribution,
  AgentOutcome,
  ApiKey,
  CandidateExperience,
  IngestionRun,
  KnownPath,
  SourceItem,
  SourceRegistry,
  User,
} from "@knownpath/domain";
import type { Collection, Db } from "mongodb";

export const collectionNames = {
  agentContributions: "agent_contributions",
  agentOutcomes: "agent_outcomes",
  apiKeys: "api_keys",
  candidateExperiences: "candidate_experiences",
  ingestionRuns: "ingestion_runs",
  knownPaths: "known_paths",
  sourceItems: "source_items",
  sourceRegistries: "source_registries",
  users: "users",
} as const;

export interface KnownPathCollections {
  readonly agentContributions: Collection<AgentContribution>;
  readonly agentOutcomes: Collection<AgentOutcome>;
  readonly apiKeys: Collection<ApiKey>;
  readonly candidateExperiences: Collection<CandidateExperience>;
  readonly ingestionRuns: Collection<IngestionRun>;
  readonly knownPaths: Collection<KnownPath>;
  readonly sourceItems: Collection<SourceItem>;
  readonly sourceRegistries: Collection<SourceRegistry>;
  readonly users: Collection<User>;
}

export function getCollections(database: Db): KnownPathCollections {
  return {
    agentContributions: database.collection<AgentContribution>(collectionNames.agentContributions),
    agentOutcomes: database.collection<AgentOutcome>(collectionNames.agentOutcomes),
    apiKeys: database.collection<ApiKey>(collectionNames.apiKeys),
    candidateExperiences: database.collection<CandidateExperience>(
      collectionNames.candidateExperiences,
    ),
    ingestionRuns: database.collection<IngestionRun>(collectionNames.ingestionRuns),
    knownPaths: database.collection<KnownPath>(collectionNames.knownPaths),
    sourceItems: database.collection<SourceItem>(collectionNames.sourceItems),
    sourceRegistries: database.collection<SourceRegistry>(collectionNames.sourceRegistries),
    users: database.collection<User>(collectionNames.users),
  };
}
