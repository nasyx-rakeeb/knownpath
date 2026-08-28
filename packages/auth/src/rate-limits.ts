export interface RateLimitPolicy {
  readonly max: number;
  readonly name:
    | "default"
    | "sign-in"
    | "api-key-mutation"
    | "knowledge-search"
    | "knowledge-read"
    | "knowledge-usage"
    | "contribution-submit"
    | "outcome-submit"
    | "provider-heavy"
    | "mcp-mutation"
    | "admin-read"
    | "admin-sensitive";
  readonly timeWindowMs: number;
}

export interface AbuseRateGate {
  consume(input: {
    readonly key: string;
    readonly max: number;
    readonly namespace: "admin" | "ai" | "contribution" | "mcp" | "outcome";
    readonly windowMs: number;
  }): Promise<{ readonly allowed: boolean; readonly retryAfterMs: number }>;
  probe(): Promise<"ok" | "unavailable">;
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
    outcomeSubmit: { max: 10, name: "outcome-submit", timeWindowMs: 60_000 },
    providerHeavy: { max: 10, name: "provider-heavy", timeWindowMs: 60_000 },
    mcpMutation: { max: 8, name: "mcp-mutation", timeWindowMs: 60_000 },
    adminRead: { max: 60, name: "admin-read", timeWindowMs: 60_000 },
    adminSensitive: { max: 10, name: "admin-sensitive", timeWindowMs: 60_000 },
  } as const satisfies Record<string, RateLimitPolicy>;
}
