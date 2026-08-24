export type OutcomeErrorCode =
  | "outcome_idempotency_conflict"
  | "outcome_execution_conflict"
  | "outcome_rate_limited"
  | "outcome_note_rejected"
  | "outcome_target_not_accessible";

export class OutcomeError extends Error {
  public constructor(
    public readonly code: OutcomeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OutcomeError";
  }
}
