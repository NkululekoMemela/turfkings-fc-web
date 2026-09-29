import test from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

let env;
const venuePath = ["leagueVenues", "invitation-field"];
const clubId = "invited-club";
const signedIn = uid => env.authenticatedContext(uid, {
  email: `${uid}@example.com`, email_verified: true,
}).firestore();
const invitation = {
  clubId, clubName: "Invited Club", status: "pending",
  invitedByUid: "field-owner",
};
const season = {
  id: "invited-season", name: "Season One", status: "active",
  startsOn: "2026-10-15", entryFee: 500, prizeMoney: 10000,
  registrationOpen: true, announcedAtMs: 1, clubIds: [],
  invitations: { [clubId]: invitation },
};

const response = (uid, status = "accepted") => ({
  "league.activeSeason.invitations": {
    [clubId]: {
      ...invitation, status, confirmedByUid: uid,
      confirmedAt: serverTimestamp(),
    },
  },
  "league.activeSeason.clubIds": status === "accepted" ? [clubId] : [],
  "league.activeSeason.lastRespondingClubId": clubId,
  updatedAt: serverTimestamp(),
});

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-season-invitations",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});
test.after(async () => env?.cleanup());
test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, ...venuePath), {
      id: "invitation-field", ownerUid: "field-owner",
      league: { activeSeason: season },
    });
    await setDoc(doc(db, "clubs", clubId), {
      ownerUid: "club-admin", adminUids: ["club-admin"],
      adminEmails: [], name: "Invited Club",
    });
    await setDoc(doc(db, "clubFieldMemberships", clubId), {
      clubId, venueId: "invitation-field", status: "active",
    });
  });
});

test("Club administrator accepts or declines their season invitation", async () => {
  await assertSucceeds(updateDoc(
    doc(signedIn("club-admin"), ...venuePath),
    response("club-admin", "declined")
  ));
});

test("Club acceptance adds only that Club and cannot change season terms", async () => {
  const db = signedIn("club-admin");
  await assertFails(updateDoc(doc(db, ...venuePath), {
    ...response("club-admin"), "league.activeSeason.entryFee": 0,
  }));
  await assertFails(updateDoc(doc(db, ...venuePath), {
    ...response("club-admin"),
    "league.activeSeason.clubIds": [clubId, "another-club"],
  }));
  await assertSucceeds(updateDoc(doc(db, ...venuePath), response("club-admin")));
  await assertFails(updateDoc(doc(db, ...venuePath), response("club-admin")));
});

test("Outsiders, transferred Clubs and closed registration cannot respond", async () => {
  await assertFails(updateDoc(
    doc(signedIn("outsider"), ...venuePath), response("outsider")
  ));
  await env.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "clubFieldMemberships", clubId), {
      venueId: "another-field",
    });
  });
  await assertFails(updateDoc(
    doc(signedIn("club-admin"), ...venuePath), response("club-admin")
  ));
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(doc(db, "clubFieldMemberships", clubId), {
      venueId: "invitation-field",
    });
    await updateDoc(doc(db, ...venuePath), {
      "league.activeSeason.registrationOpen": false,
    });
  });
  await assertFails(updateDoc(
    doc(signedIn("club-admin"), ...venuePath), response("club-admin")
  ));
});
