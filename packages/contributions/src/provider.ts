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
  if (visibility.scope !== "public" && capability !== "approved_private") {
    throw new ContributionError(
      "contribution_provider_visibility_forbidden",
      "Private and workspace contributions require an explicitly configured provider approved for private data",
    );
  }
}
