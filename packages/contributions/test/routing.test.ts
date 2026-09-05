import assert from "node:assert/strict";
import test from "node:test";

import type { AgentContributionV2 } from "@knownpath/domain";

import {
  contributionCanonicalizationJobKey,
  contributionCanonicalizationRoute,
} from "../src/routing.js";

function withRelationship(relationship: AgentContributionV2["relationship"]) {
  return { relationship } as AgentContributionV2;
}

test("novel contributions enter discovery instead of targeting a record", () => {
  assert.deepEqual(contributionCanonicalizationRoute(withRelationship("novel")), {
    mode: "discover_novel",
  });
});

test("corroboration and extension support an existing record without a new variant", () => {
  for (const relationship of ["corroboration", "extension"] as const)
    assert.deepEqual(contributionCanonicalizationRoute(withRelationship(relationship)), {
      mode: "support_existing",
      alternativeSolution: false,
    });
});

test("variants create alternatives while corrections and conflicts remain conflicting evidence", () => {
  assert.deepEqual(contributionCanonicalizationRoute(withRelationship("variant")), {
    mode: "support_existing",
    alternativeSolution: true,
  });
  for (const relationship of ["correction", "conflict"] as const)
    assert.deepEqual(contributionCanonicalizationRoute(withRelationship(relationship)), {
      mode: "conflict_existing",
    });
});

test("a failed canonicalization receives a new recovery key bound to the prior step", () => {
  const contribution = {
    _id: "00000000-0000-4000-8000-000000000001",
    processing: {
      stage: "failed",
      candidateExperienceId: "00000000-0000-4000-8000-000000000002",
      canonicalizationStepId: "00000000-0000-4000-8000-000000000003",
    },
  } as AgentContributionV2;
  assert.deepEqual(contributionCanonicalizationJobKey(contribution), [
    "approved-contribution-canonicalization-recovery-v1",
    contribution._id,
    contribution.processing.candidateExperienceId,
    contribution.processing.canonicalizationStepId,
  ]);
});
