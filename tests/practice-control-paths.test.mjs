import test from "node:test";
import assert from "node:assert/strict";

import {
  practiceControlClubPath,
  practiceControlWeekPath,
  practiceEntitlementDocPath,
  practiceTransfersCollectionPath,
  practiceTransferDocPath,
} from "../src/core/practiceControlPaths.js";

test("Practice control plane is outside disposable sandbox", () => {
  const path = practiceControlClubPath("misfits-fc");

  assert.equal(
    path,
    "practiceControl/misfits-fc"
  );

  assert.equal(
    path.startsWith("sandboxes/practice/"),
    false
  );
});

test("weekly entitlement path is club and week scoped", () => {
  assert.equal(
    practiceEntitlementDocPath(
      "misfits-fc",
      "2026-08-10",
      "user-a"
    ),
    "practiceControl/misfits-fc/weeks/2026-08-10/entitlements/user-a"
  );
});

test("transfer ledger belongs to same club and week", () => {
  assert.equal(
    practiceTransfersCollectionPath(
      "misfits-fc",
      "2026-08-10"
    ),
    "practiceControl/misfits-fc/weeks/2026-08-10/transfers"
  );

  assert.equal(
    practiceTransferDocPath(
      "misfits-fc",
      "2026-08-10",
      "transfer-123"
    ),
    "practiceControl/misfits-fc/weeks/2026-08-10/transfers/transfer-123"
  );
});

test("control paths reject path injection", () => {
  assert.throws(
    () =>
      practiceControlWeekPath(
        "clubs/misfits-fc",
        "2026-08-10"
      ),
    /must be a document ID/
  );
});
