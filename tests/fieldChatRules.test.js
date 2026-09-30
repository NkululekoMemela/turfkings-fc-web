import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const projectId = "demo-fanm-field-chat";
let env;

const venuePath = ["leagueVenues", "venue-one"];
const messagePath = (id) => [...venuePath, "chatMessages", id];
const participantPath = (uid) => [...venuePath, "chatParticipants", uid];
const staffPath = (uid) => [...venuePath, "staff", uid];
const restrictionPath = (uid) => [...venuePath, "chatRestrictions", uid];
const memberPath = ["clubs", "club-one", "members", "member-one"];

const signedIn = (uid, email) =>
  env.authenticatedContext(uid, {
    email,
    email_verified: true,
  }).firestore();

const message = ({
  uid,
  name,
  role,
  clubId = "",
  clubName = "",
  text = "Hello from the Field",
}) => ({
  text,
  senderUid: uid,
  senderName: name,
  senderRole: role,
  clubId,
  clubName,
  createdAt: serverTimestamp(),
  createdAtMs: Date.now(),
  reactionsByUser: {},
});

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
});

test.after(async () => {
  await env?.cleanup();
});

test("Field chat checks Club membership, staff, muting, and moderation", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, ...venuePath), {
      id: "venue-one",
      ownerUid: "owner",
      league: {
        activeSeason: {
          id: "season-one",
          status: "active",
          clubIds: ["club-one"],
        },
      },
    });
    await setDoc(doc(db, "clubFieldMemberships", "club-one"), {
      clubId: "club-one",
      venueId: "venue-one",
      status: "active",
    });
    await setDoc(doc(db, "clubs", "club-one"), {
      name: "Club One",
    });
    await setDoc(doc(db, ...memberPath), {
      uid: "player",
      email: "player@example.com",
      fullName: "Player One",
      status: "active",
    });
    await setDoc(doc(db, ...staffPath("referee")), {
      uid: "referee",
      email: "referee@example.com",
      fullName: "Referee One",
      role: "referee",
      status: "active",
      isAdministrator: false,
    });
    await setDoc(doc(db, ...staffPath("manager")), {
      uid: "manager",
      email: "manager@example.com",
      fullName: "Manager One",
      role: "field_manager",
      status: "active",
      isAdministrator: true,
    });
  });

  const player = signedIn("player", "player@example.com");
  const referee = signedIn("referee", "referee@example.com");
  const manager = signedIn("manager", "manager@example.com");
  const owner = signedIn("owner", "owner@example.com");
  const outsider = signedIn("outsider", "outsider@example.com");
  const impostor = signedIn("impostor", "impostor@example.com");

  await assertFails(
    getDocs(query(collection(outsider, ...venuePath, "chatMessages")))
  );
  await assertFails(
    setDoc(doc(impostor, ...participantPath("impostor")), {
      clubId: "club-one",
      memberId: "member-one",
    })
  );

  await assertSucceeds(
    setDoc(doc(player, ...participantPath("player")), {
      clubId: "club-one",
      memberId: "member-one",
    })
  );
  await assertSucceeds(
    getDocs(query(collection(player, ...venuePath, "chatMessages")))
  );
  await assertSucceeds(
    getDocs(query(collection(referee, ...venuePath, "chatMessages")))
  );

  await assertSucceeds(
    setDoc(doc(player, ...messagePath("player-message")),
      message({
        uid: "player",
        name: "Player One",
        role: "club_member",
        clubId: "club-one",
        clubName: "Club One",
      }))
  );
  await assertSucceeds(
    setDoc(doc(referee, ...messagePath("staff-message")),
      message({
        uid: "referee",
        name: "Referee One",
        role: "referee",
      }))
  );

  await assertFails(
    setDoc(doc(player, ...messagePath("impersonation")),
      message({
        uid: "referee",
        name: "Referee One",
        role: "referee",
      }))
  );
  await assertFails(
    setDoc(doc(player, ...messagePath("false-club")),
      message({
        uid: "player",
        name: "Player One",
        role: "club_member",
        clubId: "club-one",
        clubName: "Another Club",
      }))
  );
  await assertFails(
    deleteDoc(doc(player, ...messagePath("staff-message")))
  );

  await assertSucceeds(
    updateDoc(doc(player, ...messagePath("staff-message")), {
      "reactionsByUser.player": "👏",
    })
  );
  await assertFails(
    updateDoc(doc(player, ...messagePath("staff-message")), {
      "reactionsByUser.referee": "👏",
    })
  );

  await assertSucceeds(
    setDoc(doc(manager, ...restrictionPath("player")), {
      uid: "player",
      muted: true,
      reason: "Emulator moderation test",
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    setDoc(doc(player, ...messagePath("muted-message")),
      message({
        uid: "player",
        name: "Player One",
        role: "club_member",
        clubId: "club-one",
        clubName: "Club One",
      }))
  );
  await assertFails(
    updateDoc(doc(player, ...messagePath("staff-message")), {
      "reactionsByUser.player": "🔥",
    })
  );
  await assertSucceeds(
    getDoc(doc(player, ...messagePath("staff-message")))
  );
  await assertSucceeds(
    deleteDoc(doc(manager, ...messagePath("player-message")))
  );
  await assertFails(
    setDoc(doc(outsider, ...restrictionPath("referee")), {
      uid: "referee",
      muted: true,
      reason: "Unauthorized",
      updatedAt: serverTimestamp(),
    })
  );

  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), ...memberPath), {
      status: "inactive",
    });
  });
  await assertFails(
    getDoc(doc(player, ...messagePath("staff-message")))
  );

  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), ...staffPath("referee")), {
      status: "rejected",
    });
  });
  await assertFails(
    getDoc(doc(referee, ...messagePath("staff-message")))
  );

  await assertSucceeds(
    getDoc(doc(owner, ...messagePath("staff-message")))
  );
  await assert.equal(
    (await assertSucceeds(
      getDoc(doc(manager, ...messagePath("staff-message")))
    )).exists(),
    true
  );
});

test("Field membership keeps chat between seasons and transfer revokes access", async () => {
  const player = signedIn("player", "player@example.com");

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await updateDoc(doc(db, ...memberPath), { status: "active" });
    await deleteDoc(doc(db, ...restrictionPath("player")));
    await updateDoc(doc(db, ...venuePath), {
      "league.activeSeason.clubIds": [],
    });
  });

  await assertSucceeds(
    getDocs(query(collection(player, ...venuePath, "chatMessages")))
  );
  await assertSucceeds(
    setDoc(doc(player, ...messagePath("between-seasons-message")),
      message({
        uid: "player",
        name: "Player One",
        role: "club_member",
        clubId: "club-one",
        clubName: "Club One",
      }))
  );

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "leagueVenues", "venue-two"), {
      id: "venue-two", ownerUid: "other-owner",
    });
    await updateDoc(doc(db, "clubFieldMemberships", "club-one"), {
      venueId: "venue-two",
    });
  });

  await assertFails(
    getDocs(query(collection(player, ...venuePath, "chatMessages")))
  );
  await assertFails(
    setDoc(doc(player, ...messagePath("previous-field-message")),
      message({
        uid: "player",
        name: "Player One",
        role: "club_member",
        clubId: "club-one",
        clubName: "Club One",
      }))
  );
});


test("dual-role accounts can chat with either verified identity", async () => {
  for (const kind of ["owner", "staff"]) {
    const venueId = `dual-${kind}-venue`;
    const clubId = `dual-${kind}-club`;
    const uid = `dual-${kind}`;
    const email = `${uid}@example.com`;
    const base = ["leagueVenues", venueId];
    const playerName = `Club Player ${kind}`;
    const officialName = kind === "owner" ? email : "Field Official";
    const officialRole = kind === "owner" ? "field_manager" : "referee";
    const clubName = `Club ${kind}`;

    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, ...base), {
        id: venueId,
        ownerUid: kind === "owner" ? uid : "separate-owner",
      });
      await setDoc(doc(db, "clubs", clubId), { name: clubName });
      await setDoc(doc(db, "clubFieldMemberships", clubId), {
        clubId, venueId, status: "active",
      });
      await setDoc(doc(db, "clubs", clubId, "members", uid), {
        uid, email, fullName: playerName, status: "active",
      });
      if (kind === "staff") {
        await setDoc(doc(db, ...base, "staff", uid), {
          uid, email, fullName: officialName,
          role: officialRole, status: "active",
          isAdministrator: false,
        });
      }
    });

    const db = signedIn(uid, email);
    await assertSucceeds(setDoc(
      doc(db, ...base, "chatParticipants", uid),
      { clubId, memberId: uid },
    ));

    const asPlayer = {
      uid, name: playerName, role: "club_member", clubId, clubName,
    };
    const asOfficial = {
      uid, name: officialName, role: officialRole,
    };

    await assertSucceeds(setDoc(
      doc(db, ...base, "chatMessages", "club-arrival"),
      message(asPlayer),
    ));
    await assertSucceeds(setDoc(
      doc(db, ...base, "chatMessages", "formal-field-sign-in"),
      message(asOfficial),
    ));
    await assertFails(setDoc(
      doc(db, ...base, "chatMessages", "false-player-name"),
      message({ ...asPlayer, name: officialName }),
    ));
    await assertFails(setDoc(
      doc(db, ...base, "chatMessages", "mixed-identities"),
      message({ ...asOfficial, clubId, clubName }),
    ));

    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(
        doc(context.firestore(), "clubs", clubId, "members", uid),
        { status: "inactive" },
      );
    });

    await assertFails(setDoc(
      doc(db, ...base, "chatMessages", "inactive-club-player"),
      message(asPlayer),
    ));
    await assertSucceeds(setDoc(
      doc(db, ...base, "chatMessages", "official-still-active"),
      message(asOfficial),
    ));

    const ordinaryUid = `ordinary-${kind}`;
    const ordinaryEmail = `${ordinaryUid}@example.com`;
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(
        doc(context.firestore(), "clubs", clubId, "members", ordinaryUid),
        {
          uid: ordinaryUid, email: ordinaryEmail,
          fullName: "Ordinary Player", status: "active",
        },
      );
    });
    const ordinary = signedIn(ordinaryUid, ordinaryEmail);
    await assertSucceeds(setDoc(
      doc(ordinary, ...base, "chatParticipants", ordinaryUid),
      { clubId, memberId: ordinaryUid },
    ));
    await assertSucceeds(setDoc(
      doc(ordinary, ...base, "chatMessages", "ordinary-player"),
      message({
        uid: ordinaryUid, name: "Ordinary Player",
        role: "club_member", clubId, clubName,
      }),
    ));
    await assertFails(setDoc(
      doc(ordinary, ...base, "chatMessages", "player-claims-official"),
      message({
        uid: ordinaryUid, name: "Ordinary Player",
        role: "field_manager",
      }),
    ));
  }
});
