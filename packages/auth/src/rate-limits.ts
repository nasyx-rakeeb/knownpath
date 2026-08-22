export interface RateLimitPolicy {
  readonly max: number;
  readonly name: "default" | "sign-in" | "api-key-mutation";
  readonly timeWindowMs: number;
}

export function createRateLimitPolicies(defaultMax: number, timeWindowMs: number) {
  return {
    default: { max: defaultMax, name: "default", timeWindowMs },
    signIn: { max: 10, name: "sign-in", timeWindowMs: 60_000 },
    apiKeyMutation: { max: 30, name: "api-key-mutation", timeWindowMs: 60_000 },
  } as const satisfies Record<string, RateLimitPolicy>;
}
