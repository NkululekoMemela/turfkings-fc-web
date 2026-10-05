import {readFileSync} from "node:fs";
import {test, before, after, beforeEach} from "node:test";
import {
  initializeTestEnvironment, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
} from "firebase/firestore";

let environment;
const squadPath = "leagueSeasonSquads/field~season~club";
const receiptPath = `${squadPath}/paymentConfirmations/member-0`;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-season-squad-rules",
    firestore: {rules: readFileSync("firestore.rules", "utf8")},
  });
});
after(async () => {await environment?.cleanup();});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "clubs/club"), {
      ownerUid: "owner", adminUids: ["admin"],
      captainEmails: ["captain@example.com"],
    });
    await setDoc(doc(db, squadPath), {
      clubId: "club", venueId: "field", seasonId: "season",
      entries: {"member-0": {
        memberId: "member-0", paymentStatus: "pending",
      }},
    });
    await setDoc(doc(db, receiptPath), {
      memberId: "member-0", amountCents: 75000,
    });
  });
});

for (const role of ["owner", "admin", "captain", "player", "outsider"]) {
  test(`${role} cannot directly read or change season squad money records`, async () => {
    const db = environment.authenticatedContext(role, {
      email: `${role}@example.com`, email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(db, squadPath)));
    await assertFails(updateDoc(doc(db, squadPath), {
      "entries.member-0.paymentStatus": "paid",
    }));
    await assertFails(deleteDoc(doc(db, squadPath)));
    await assertFails(setDoc(doc(db, "leagueSeasonSquads/new-squad"), {
      clubId: "club", entries: {},
    }));
    await assertFails(getDoc(doc(db, receiptPath)));
    await assertFails(setDoc(doc(db, receiptPath), {amountCents: 1}));
    await assertFails(deleteDoc(doc(db, receiptPath)));
  });
}

test("signed-out users cannot read squad or payment records", async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, squadPath)));
  await assertFails(getDoc(doc(db, receiptPath)));
});
