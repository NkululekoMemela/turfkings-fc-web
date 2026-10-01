import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection, doc, getDocs, setDoc, updateDoc,
} from "firebase/firestore";
import { saveSignupWithCapacity } from "../src/core/payments/saveSignupWithCapacity.js";

let env;
const clubId = "capacity-club";
const week = "2026-11-04";

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-club-booking-capacity",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
test.after(async () => env?.cleanup());

async function seed(limit = 1) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "clubs", clubId), {
      ownerUid: "admin", createdByUid: "admin", adminUids: ["admin"],
      bookingSettings: { maxPlayers: limit },
    });
  });
}

function save(db, playerId, collectionName = "pendingSignups", extra = {}) {
  return saveSignupWithCapacity({
    db, clubId,
    ref: doc(db, "clubs", clubId, collectionName, playerId),
    data: { playerId, selectedWeeks: [week], ...extra },
    options: { merge: true },
    pendingCollection: collection(db, "clubs", clubId, "pendingSignups"),
    matchCollection: collection(db, "clubs", clubId, "matchSignups"),
    defaultLimit: 15,
  });
}

test("two simultaneous players cannot both take the final place", async () => {
  await seed();
  const a = env.authenticatedContext("a").firestore();
  const b = env.authenticatedContext("b").firestore();
  const results = await Promise.allSettled([save(a, "a"), save(b, "b")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  const records = await getDocs(collection(a, "clubs", clubId, "pendingSignups"));
  assert.equal(records.size, 1);
});

test("pending and payment records for one player count as one place", async () => {
  await seed(2);
  const db = env.authenticatedContext("a").firestore();
  await save(db, "a");
  await save(db, "a", "matchSignups");
  await save(db, "b");
  await assert.rejects(save(db, "c"), /full/);
});

test("lowering capacity preserves existing paid bookings", async () => {
  await seed(2);
  const db = env.authenticatedContext("admin").firestore();
  await save(db, "a", "matchSignups", { paidWeeks: [week] });
  await save(db, "b", "matchSignups", { paidWeeks: [week] });
  await updateDoc(doc(db, "clubs", clubId), {
    "bookingSettings.maxPlayers": 1,
  });
  await save(db, "a", "matchSignups", { paidWeeks: [week], note: "retained" });
  await assert.rejects(save(db, "c"), /full/);
});

test("players cannot change capacity or late fee settings", async () => {
  await seed();
  const player = env.authenticatedContext("player").firestore();
  await assertFails(updateDoc(doc(player, "clubs", clubId), {
    bookingSettings: {
      maxPlayers: 100,
      lateBookingFee: { enabled: false, feePerGame: 0 },
    },
  }));
  await assertFails(updateDoc(doc(player, "clubs", clubId), {
    paymentSettings: { pricingModel: { serviceFeePerPlayer: 0 } },
  }));
  const admin = env.authenticatedContext("admin").firestore();
  await assertSucceeds(updateDoc(doc(admin, "clubs", clubId), {
    bookingSettings: {
      maxPlayers: 15,
      lateBookingFee: { enabled: true, feePerGame: 7 },
    },
  }));
});
