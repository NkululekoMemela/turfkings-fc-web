"use strict";

const crypto = require("crypto");
const {FieldValue, Timestamp} = require("firebase-admin/firestore");

const HANDOFF_TTL_SECONDS = 120;

function safeString(value = "") {
  return String(value || "").trim();
}

function normalizeEmail(value = "") {
  return safeString(value).toLowerCase();
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => safeString(item)).filter(Boolean)
    : [];
}

function emailArray(value) {
  return stringArray(value).map(normalizeEmail);
}

function roleAllowsCamera(role) {
  const normalized = safeString(role).toLowerCase();
  return normalized === "admin" || normalized === "captain";
}

function limitedString(value, maxLength = 160) {
  return safeString(value).slice(0, maxLength);
}

function normalizeCameraPlayer(
  rawPlayer,
  fallbackTeamId,
  fallbackClubId
) {
  const player =
    rawPlayer && typeof rawPlayer === "object"
      ? rawPlayer
      : {};

  const name = limitedString(
    player.name ||
      player.displayName ||
      player.fullName,
    120
  );

  if (!name) return null;

  const id = limitedString(
    player.id ||
      player.playerId ||
      player.memberId ||
      name.toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, ""),
    160
  );

  return {
    id,
    name,
    teamId:
      limitedString(player.teamId, 160) ||
      fallbackTeamId ||
      null,
    clubId:
      limitedString(
        player.clubId ||
          player.playerClubId,
        160
      ) ||
      fallbackClubId ||
      null,

    // Display metadata only. This grants no Firebase authority.
    // Preserve an existing FANM player photo through the secure
    // camera handoff so Android does not need broad player access.
    photoUrl:
      limitedString(
        player.photoUrl ||
          player.photoURL ||
          player.photo ||
          player.avatarUrl ||
          player.avatarURL,
        2048
      ) ||
      null,
  };
}

function normalizeCameraTeam(
  rawTeam,
  fallbackName,
  organisingClubId
) {
  const team =
    rawTeam && typeof rawTeam === "object"
      ? rawTeam
      : {};

  const teamId =
    limitedString(team.teamId || team.id, 160) ||
    null;

  const clubId =
    limitedString(team.clubId, 160) ||
    organisingClubId ||
    null;

  const teamName =
    limitedString(
      team.teamName ||
        team.name ||
        team.label ||
        fallbackName,
      160
    ) || fallbackName;

  const rawPlayers =
    Array.isArray(team.players)
      ? team.players.slice(0, 40)
      : [];

  const players =
    rawPlayers
      .map((player) =>
        normalizeCameraPlayer(
          player,
          teamId,
          clubId
        )
      )
      .filter(Boolean);

  return {
    teamId,
    clubId,
    teamName,
    abbrev: limitedString(team.abbrev, 12) || "",
    logoUrl: limitedString(team.logoUrl || team.logo32 || team.logo, 2048) || "",
    players,
  };
}

function normalizeCameraFixtureContext(
  rawContext,
  organisingClubId,
  matchId
) {
  const raw =
    rawContext && typeof rawContext === "object"
      ? rawContext
      : {};

  const teamA =
    normalizeCameraTeam(
      raw.teamA,
      "Team A",
      organisingClubId
    );

  const teamB =
    normalizeCameraTeam(
      raw.teamB,
      "Team B",
      organisingClubId
    );

  /*
   * participatingClubIds is FOOTBALL METADATA only.
   *
   * It does NOT grant Firebase authority.
   * Camera Firebase authority remains scoped to the server-approved
   * organising club + exact match.
   *
   * Future Challenge / Club League validation can replace these
   * client-supplied team club IDs with authoritative fixture data.
   */
  const participatingClubIds =
    Array.from(
      new Set(
        [
          organisingClubId,
          teamA.clubId,
          teamB.clubId,
        ].filter(Boolean)
      )
    );

  const rawMatchNo = Number(raw.matchNo);

  return {
    fixtureId: matchId,
    matchId,
    organisingClubId,

    competitionType:
      limitedString(
        raw.competitionType ||
          "within_club",
        80
      ),

    matchType:
      limitedString(raw.matchType, 80),

    gameFormat:
      limitedString(raw.gameFormat, 80),

    matchNo:
      Number.isFinite(rawMatchNo) && rawMatchNo > 0
        ? Math.floor(rawMatchNo)
        : null,

    seasonId:
      limitedString(raw.seasonId, 160) ||
      null,

    refereeMatchStarted:
      raw.refereeMatchStarted === true,

    participatingClubIds,

    teamA,
    teamB,
  };
}

function clubAuthorityAllowsCamera(club, authenticatedUser) {
  const uid = safeString(authenticatedUser?.uid);
  const email = normalizeEmail(authenticatedUser?.email);

  const authorityUids = new Set([
    safeString(club?.createdByUid),
    safeString(club?.ownerUid),
    ...stringArray(club?.adminUids),
  ].filter(Boolean));

  const authorityEmails = new Set([
    normalizeEmail(club?.adminEmail),
    normalizeEmail(club?.ownerEmail),
    normalizeEmail(club?.captainEmail),
    normalizeEmail(club?.createdByEmail),
    ...emailArray(club?.adminEmails),
    ...emailArray(club?.captainEmails),
  ].filter(Boolean));

  return (
    (uid && authorityUids.has(uid)) ||
    (email && authorityEmails.has(email))
  );
}

async function membershipAllowsCamera({
  db,
  clubId,
  authenticatedUser,
}) {
  const uid = safeString(authenticatedUser?.uid);
  const email = normalizeEmail(authenticatedUser?.email);

  const membersRef = db
    .collection("clubs")
    .doc(clubId)
    .collection("members");

  if (uid) {
    const directSnap = await membersRef.doc(uid).get();

    if (directSnap.exists) {
      const member = directSnap.data() || {};
      const status = safeString(member.status).toLowerCase();

      if (
        status !== "inactive" &&
        status !== "removed" &&
        roleAllowsCamera(member.role)
      ) {
        return true;
      }
    }

    for (const field of ["uid", "userId", "firebaseUid"]) {
      const snap = await membersRef
        .where(field, "==", uid)
        .limit(5)
        .get();

      if (
        snap.docs.some((doc) => {
          const member = doc.data() || {};
          const status = safeString(member.status).toLowerCase();
          return (
            status !== "inactive" &&
            status !== "removed" &&
            roleAllowsCamera(member.role)
          );
        })
      ) {
        return true;
      }
    }
  }

  if (email) {
    for (const field of ["email", "userEmail"]) {
      const snap = await membersRef
        .where(field, "==", email)
        .limit(5)
        .get();

      if (
        snap.docs.some((doc) => {
          const member = doc.data() || {};
          const status = safeString(member.status).toLowerCase();
          return (
            status !== "inactive" &&
            status !== "removed" &&
            roleAllowsCamera(member.role)
          );
        })
      ) {
        return true;
      }
    }
  }

  return false;
}

async function assertCameraAuthority({
  db,
  clubId,
  authenticatedUser,
}) {
  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();

  if (!clubSnap.exists) {
    const error = new Error("Club was not found.");
    error.code = "camera/club-not-found";
    throw error;
  }

  const club = clubSnap.data() || {};

  if (clubAuthorityAllowsCamera(club, authenticatedUser)) {
    return club;
  }

  const memberAuthorized = await membershipAllowsCamera({
    db,
    clubId,
    authenticatedUser,
  });

  if (!memberAuthorized) {
    const error = new Error(
      "Only an authorized club admin or captain can open the camera."
    );
    error.code = "camera/not-authorized";
    throw error;
  }

  return club;
}

async function createCameraHandoff({
  db,
  authenticatedUser,
  clubId,
  matchId,
  fixtureContext = {},
  dataScope = "official",
  now = new Date(),
}) {
  const safeClubId = safeString(clubId);
  const safeMatchId = safeString(matchId);
  const safeDataScope = safeString(dataScope).toLowerCase();

  if (!safeClubId) {
    const error = new Error("clubId is required.");
    error.code = "camera/club-required";
    throw error;
  }

  if (!safeMatchId) {
    const error = new Error("matchId is required.");
    error.code = "camera/match-required";
    throw error;
  }

  /*
   * Stage 1A red line:
   * camera handoffs are Official-only.
   * Practice must never fall through into Official camera state.
   */
  if (safeDataScope !== "official") {
    const error = new Error(
      "Camera handoff is not available from Practice."
    );
    error.code = "camera/practice-forbidden";
    throw error;
  }

  await assertCameraAuthority({
    db,
    clubId: safeClubId,
    authenticatedUser,
  });

  const safeFixtureContext =
    normalizeCameraFixtureContext(
      fixtureContext,
      safeClubId,
      safeMatchId
    );

  const handoffId = crypto.randomBytes(32).toString("hex");

  const expiresAtDate = new Date(
    now.getTime() + HANDOFF_TTL_SECONDS * 1000
  );

  const handoffRef = db
    .collection("camera_handoffs")
    .doc(handoffId);

  await handoffRef.set({
    handoffId,
    clubId: safeClubId,
    matchId: safeMatchId,

    dataScope: "official",

    /*
     * Football metadata travels through the secure one-time handoff
     * instead of being trusted from the Android deep link.
     */
    fixtureContext: safeFixtureContext,

    authorizedUid: safeString(authenticatedUser?.uid),
    authorizedEmail: normalizeEmail(authenticatedUser?.email),

    status: "pending",
    oneTime: true,

    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAtDate),

    redeemedAt: null,
    redeemedByUid: null,
    redeemedDeviceId: null,

    source: "fanm-web",
    version: 1,
  });

  return {
    handoffId,
    clubId: safeClubId,
    matchId: safeMatchId,
    dataScope: "official",
    fixtureContext: safeFixtureContext,
    expiresAt: expiresAtDate.toISOString(),
  };
}

async function redeemCameraHandoff({
  db,
  admin,
  handoffId,
  deviceId = "",
  now = new Date(),
}) {
  const safeHandoffId = safeString(handoffId);
  const safeDeviceId = safeString(deviceId);

  if (!safeHandoffId) {
    const error = new Error("handoffId is required.");
    error.code = "camera/handoff-required";
    throw error;
  }

  const handoffRef = db
    .collection("camera_handoffs")
    .doc(safeHandoffId);

  /*
   * Consume the handoff transactionally.
   *
   * This guarantees that two devices cannot successfully redeem the
   * same FANM camera launch. The first valid transaction wins.
   */
  const handoff = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(handoffRef);

    if (!snap.exists) {
      const error = new Error(
        "Camera handoff was not found."
      );
      error.code = "camera/handoff-not-found";
      throw error;
    }

    const data = snap.data() || {};

    if (safeString(data.dataScope).toLowerCase() !== "official") {
      const error = new Error(
        "Practice camera handoffs are not permitted."
      );
      error.code = "camera/practice-forbidden";
      throw error;
    }

    if (
      safeString(data.status).toLowerCase() !== "pending" ||
      data.redeemedAt
    ) {
      const error = new Error(
        "This camera handoff has already been used."
      );
      error.code = "camera/handoff-used";
      throw error;
    }

    const expiresAt =
      typeof data.expiresAt?.toDate === "function"
        ? data.expiresAt.toDate()
        : null;

    if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
      const error = new Error(
        "This camera handoff has expired."
      );
      error.code = "camera/handoff-expired";
      throw error;
    }

    const clubId = safeString(data.clubId);
    const matchId = safeString(data.matchId);
    const authorizedUid = safeString(data.authorizedUid);

    if (!clubId || !matchId || !authorizedUid) {
      const error = new Error(
        "Camera handoff is incomplete."
      );
      error.code = "camera/handoff-invalid";
      throw error;
    }

    transaction.update(handoffRef, {
      status: "redeemed",
      redeemedAt: FieldValue.serverTimestamp(),
      redeemedDeviceId: safeDeviceId || null,
    });

    return {
      clubId,
      matchId,
      authorizedUid,
      authorizedEmail: normalizeEmail(data.authorizedEmail),
      fixtureContext:
        data.fixtureContext &&
        typeof data.fixtureContext === "object"
          ? data.fixtureContext
          : {},
      expiresAt: expiresAt.toISOString(),
    };
  });

  /*
   * Give the camera its own Firebase identity rather than copying the
   * FANM user's ID token into Android.
   *
   * The UID is unique to this particular handoff. Claims bind that
   * identity to exactly one Official club + match.
   */
  const cameraUid = `camera_${safeHandoffId.slice(0, 28)}`;

  const customToken = await admin.auth().createCustomToken(
    cameraUid,
    {
      cameraSession: true,
      cameraHandoffId: safeHandoffId,
      clubId: handoff.clubId,
      matchId: handoff.matchId,
      dataScope: "official",
      launchedByUid: handoff.authorizedUid,
    }
  );

  await handoffRef.update({
    redeemedByUid: cameraUid,
  });

  return {
    customToken,
    cameraUid,
    clubId: handoff.clubId,
    matchId: handoff.matchId,
    dataScope: "official",
    fixtureContext: handoff.fixtureContext || {},
  };
}


module.exports = {
  HANDOFF_TTL_SECONDS,
  createCameraHandoff,
  redeemCameraHandoff,
  assertCameraAuthority,
};
