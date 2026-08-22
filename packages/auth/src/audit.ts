import {
  createAuditEventId,
  type AuditActor,
  type AuditEvent,
  type AuditEventType,
} from "@knownpath/domain";
import type { KnownPathRepositories } from "@knownpath/database";

export interface RecordAuditEventInput {
  readonly actor: AuditActor;
  readonly eventType: AuditEventType;
  readonly ipAddress?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly outcome: AuditEvent["outcome"];
  readonly requestId?: string;
  readonly target: AuditEvent["target"];
}

export class AuditService {
  public constructor(private readonly repositories: KnownPathRepositories) {}

  public async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    return this.repositories.auditEvents.create({
      _id: createAuditEventId(),
      schemaVersion: 1,
      eventType: input.eventType,
      occurredAt: new Date(),
      actor: input.actor,
      target: input.target,
      outcome: input.outcome,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      ...(input.metadata === undefined ? {} : { metadata: { ...input.metadata } }),
    });
  }
}
