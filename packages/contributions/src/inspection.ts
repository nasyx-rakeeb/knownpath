import type { KnownPathDatabase } from "@knownpath/database";
import { agentContributionIdSchema } from "@knownpath/domain";

export async function inspectContribution(
  database: KnownPathDatabase,
  id: string,
): Promise<string> {
  const contribution = await database.repositories.agentContributions.findById(
    agentContributionIdSchema.parse(id),
  );
  if (contribution === null) throw new Error("Contribution not found");
  if (contribution.schemaVersion !== 2)
    return JSON.stringify(
      {
        id: contribution._id,
        schemaVersion: contribution.schemaVersion,
        status: contribution.status,
      },
      null,
      2,
    );
  return JSON.stringify(
    {
      id: contribution._id,
      ownerUserId: contribution.contributor.userId,
      visibility: contribution.visibility.scope,
      consent: contribution.consent,
      payload: contribution.payload,
      sanitization: contribution.sanitization,
      trustState: contribution.trustState,
      status: contribution.status,
      processing: contribution.processing,
      moderation: contribution.moderation,
      createdAt: contribution.audit.createdAt,
    },
    null,
    2,
  );
}

export const contributionUsage = () =>
  "Contribution inspection:\n  pnpm contributions inspect --id <contribution-id>";
