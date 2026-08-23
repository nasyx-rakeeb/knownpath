import type { ContributionPayload, Visibility } from "@knownpath/domain";

import { ContributionError } from "./errors.js";

export type ContributionProviderCapability = "public_only" | "approved_private";

export interface ContributionGeneralizer {
  readonly capability: ContributionProviderCapability;
  readonly providerIdentifier: string;
  readonly modelIdentifier: string;
  readonly modelVersion: string;
  generalize(input: ContributionPayload, signal: AbortSignal): Promise<ContributionPayload>;
}

export function assertContributionProviderVisibility(
  visibility: Visibility,
  capability: ContributionProviderCapability,
): void {
  if (visibility.scope === "team") {
    throw new ContributionError(
      "team_contributions_not_supported",
      "Team contributions require team ownership and authorization that are not available yet",
    );
  }
  if (visibility.scope === "private" && capability !== "approved_private") {
    throw new ContributionError(
      "contribution_provider_visibility_forbidden",
      "Private contributions require an explicitly configured provider approved for private data",
    );
  }
}
