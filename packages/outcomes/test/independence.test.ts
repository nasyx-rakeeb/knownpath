import assert from "node:assert/strict";
import test from "node:test";

import { classifyOutcomeInfluence } from "../src/service.js";

test("originator success is recorded but excluded from independent evidence", () => {
  assert.deepEqual(
    classifyOutcomeInfluence({ outcome: "solved", duplicateWindow: false, isOriginator: true }),
    {
      status: "originator_non_independent",
      reasonCode: "originating_account_is_not_independent_evidence",
    },
  );
});

test("an unrelated account can provide independent evidence", () => {
  assert.deepEqual(
    classifyOutcomeInfluence({ outcome: "solved", duplicateWindow: false, isOriginator: false }),
    { status: "eligible", reasonCode: "independent_account_window" },
  );
});

test("not-used reports remain zero-weight even for unrelated accounts", () => {
  assert.equal(
    classifyOutcomeInfluence({ outcome: "not_used", duplicateWindow: false, isOriginator: false })
      .status,
    "not_evidence",
  );
});
