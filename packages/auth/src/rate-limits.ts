export interface RateLimitPolicy {
  readonly max: number;
  readonly name:
    | "default"
    | "sign-in"
    | "api-key-mutation"
    | "knowledge-search"
    | "knowledge-read"
    | "knowledge-usage"
    | "contribution-submit";
  readonly timeWindowMs: number;
}

export function createRateLimitPolicies(defaultMax: number, timeWindowMs: number) {
  return {
    default: { max: defaultMax, name: "default", timeWindowMs },
    signIn: { max: 10, name: "sign-in", timeWindowMs: 60_000 },
    apiKeyMutation: { max: 30, name: "api-key-mutation", timeWindowMs: 60_000 },
    knowledgeSearch: { max: 30, name: "knowledge-search", timeWindowMs: 60_000 },
    knowledgeRead: { max: 120, name: "knowledge-read", timeWindowMs: 60_000 },
    knowledgeUsage: { max: 120, name: "knowledge-usage", timeWindowMs: 60_000 },
    contributionSubmit: { max: 12, name: "contribution-submit", timeWindowMs: 60_000 },
  } as const satisfies Record<string, RateLimitPolicy>;
}
