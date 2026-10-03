import { readFileSync } from "node:fs";
import { test, before, after, beforeEach } from "node:test";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

let env;
const id = "field-one~season-one~day-one~club-one";
const path = `leagueClubBookings/${id}`;
const db = uid => env.authenticatedContext(uid).firestore();
const base = () => ({
  venueId: "field-one", seasonId: "season-one", matchDayId: "day-one",
  clubId: "club-one", matchDayIndex: 0, fixtureIndex: 0,
  fixtureId: "fixture-one", limit: 5, entries: {}, changedPlayerId: "",
  updatedByUid: "admin", updatedAt: serverTimestamp(),
});
const entry = (index = 1) => ({
  playerId: `p${index}`, sourcePlayerId: `profile-${index}`,
  fullName: `Player ${index}`, paymentStatus: "pending",
  bookedByUid: "player", actorMemberId: "member-player",
  bookedAt: serverTimestamp(),
});
const change = entries => ({
  entries, changedPlayerId: "p1",
  updatedByUid: "player", updatedAt: serverTimestamp(),
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-league-booking",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, "clubs/club-one"), {
      ownerUid: "admin", adminUids: ["admin"],
    });
    await setDoc(doc(store, "clubs/club-one/members/member-player"), {
      uid: "player", status: "active", role: "player",
    });
    await setDoc(doc(store, "clubFieldMemberships/club-one"), {
      venueId: "field-one", status: "active",
    });
    await setDoc(doc(store, "leagueVenues/field-one"), {
      id: "field-one", ownerUid: "manager",
      league: { activeSeason: {
        id: "season-one", status: "active", gameFormat: "5_V_5",
        schedulePublishedAtMs: 1, clubIds: ["club-one"], liveMatches: {},
        matchDays: [{ id: "day-one", status: "scheduled", fixtureIds: ["fixture-one"] }],
        fixtures: [{
          id: "fixture-one", matchDayId: "day-one", status: "scheduled",
          clubAId: "club-one", clubBId: "club-two",
        }],
      }},
    });
    for (let i = 1; i <= 6; i++) {
      await setDoc(doc(store, `clubs/club-one/players/profile-${i}`), {
        fullName: `Player ${i}`, status: "active",
      });
    }
  });
});

test("only the Club administrator configures capacity", async () => {
  await assertFails(setDoc(doc(db("player"), path), {
    ...base(), updatedByUid: "player",
  }));
  await assertSucceeds(setDoc(doc(db("admin"), path), base()));
});

test("active members reserve pending places but cannot mark them paid", async () => {
  await assertSucceeds(setDoc(doc(db("admin"), path), base()));
  await assertSucceeds(updateDoc(doc(db("player"), path), change({ p1: entry() })));
  await assertFails(updateDoc(doc(db("player"), path), {
    "entries.p1.paymentStatus": "paid",
    changedPlayerId: "p1", updatedByUid: "player", updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(db("admin"), path), {
    "entries.p1.paymentStatus": "paid",
    updatedByUid: "admin", updatedAt: serverTimestamp(),
  }));
});

test("players cannot increase capacity or remove paid reservations", async () => {
  await assertSucceeds(setDoc(doc(db("admin"), path), {
    ...base(), entries: { p1: { ...entry(), paymentStatus: "paid" } },
  }));
  await assertFails(updateDoc(doc(db("player"), path), change({})));
  await assertFails(updateDoc(doc(db("player"), path), {
    limit: 30, updatedByUid: "player", updatedAt: serverTimestamp(),
  }));
});

test("capacity and schedule references are enforced", async () => {
  const entries = Object.fromEntries(
    Array.from({ length: 6 }, (_, i) => [`p${i+1}`, entry(i+1)]));
  await assertFails(setDoc(doc(db("admin"), path), { ...base(), entries }));
  await assertFails(setDoc(doc(db("admin"), path), {
    ...base(), matchDayIndex: 99,
  }));
});

test("nonmembers cannot reserve a place", async () => {
  await assertSucceeds(setDoc(doc(db("admin"), path), base()));
  await assertFails(updateDoc(doc(db("outsider"), path), {
    ...change({ p1: { ...entry(), bookedByUid: "outsider" } }),
    updatedByUid: "outsider",
  }));
});
