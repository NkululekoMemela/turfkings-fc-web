const {FieldValue} = require("firebase-admin/firestore");
const {createHash} = require("node:crypto");

const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);
const email = value => typeof value === "string"
  ? value.trim().toLowerCase() : "";
const list = value => Array.isArray(value) ? value : [];

function squadId({venueId, seasonId, clubId}) {
  for (const id of [venueId, seasonId, clubId]) {
    if (!validId(id)) throw new Error("Invalid Club, Field or season reference.");
  }
  return [venueId, seasonId, clubId].join("~");
}

function canManageSquad(club, user) {
  if (!club || !user?.uid) return false;
  if ([club.ownerUid, club.createdByUid, ...list(club.adminUids)]
    .includes(user.uid)) return true;
  const address = user.email_verified === true ? email(user.email) : "";
  const allowed = [
    ...list(club.adminEmails), ...list(club.captainEmails),
    club.captainEmail, club.captain?.email,
  ].map(email).filter(Boolean);
  return Boolean(address && allowed.includes(address));
}

function ownsMember(member, user) {
  return Boolean(user?.uid && member?.status === "active" && (
    member.uid === user.uid ||
    (user.email_verified === true && email(user.email) &&
      email(member.email) === email(user.email))
  ));
}

async function loadContext(tx, db, scope) {
  const id = squadId(scope);
  const clubRef = db.doc(`clubs/${scope.clubId}`);
  const venueRef = db.doc(`leagueVenues/${scope.venueId}`);
  const squadRef = db.collection("leagueSeasonSquads").doc(id);
  const clubSnap = await tx.get(clubRef);
  const venueSnap = await tx.get(venueRef);
  const membershipSnap = await tx.get(
    db.doc(`clubFieldMemberships/${scope.clubId}`)
  );
  const squadSnap = await tx.get(squadRef);
  const club = clubSnap.data();
  const venue = venueSnap.data();
  const membership = membershipSnap.data();
  const season = venue?.league?.activeSeason;
  if (!club || club.deleted === true || club.status === "deleted" ||
      !venue || membership?.status !== "active" ||
      membership.venueId !== scope.venueId ||
      season?.id !== scope.seasonId || season.status !== "active" ||
      !list(season.clubIds).includes(scope.clubId)) {
    throw new Error("This Club is not registered in the active Field season.");
  }
  return {club, season, clubRef, squadRef, squad: squadSnap.data()};
}

async function createSeasonSquad({db, user, body, now = Date.now()}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {venueId, seasonId, clubId, totalCents, players} = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  if (!Array.isArray(players) || players.length > 30 ||
      players.some(item => !validId(item?.sourcePlayerId) ||
        !validId(item?.memberId))) {
    throw new Error("Select registered players and their member links.");
  }
  const policy = await import("./fieldSeasonSquadPolicy.mjs");
  return db.runTransaction(async tx => {
    const context = await loadContext(tx, db, scope);
    if (!canManageSquad(context.club, user)) {
      throw new Error("Only this Club's administrator or captain can select the squad.");
    }
    const plan = policy.seasonContributionPlan({
      totalCents, squadSize: players.length,
      gameFormat: context.season.gameFormat,
      maximum: context.season.maxPlayersPerClubPerDay ?? 30,
    });
    const verifiedPlayers = [];
    for (const selected of players) {
      const memberSnap = await tx.get(context.clubRef.collection("members")
        .doc(selected.memberId));
      const playerSnap = await tx.get(context.clubRef.collection("players")
        .doc(selected.sourcePlayerId));
      const member = memberSnap.data();
      const player = playerSnap.data();
      if (member?.status !== "active" || !player ||
          String(player.status || "active").toLowerCase() !== "active" ||
          member.playerId !== selected.sourcePlayerId) {
        throw new Error(
          "Each selected player needs an active Club member with a matching player link."
        );
      }
      const fullName = String(player.fullName || player.displayName ||
        player.name || player.playerName || "").trim();
      verifiedPlayers.push({
        sourcePlayerId: selected.sourcePlayerId,
        memberId: selected.memberId, fullName,
      });
    }
    const invitations = policy.createSeasonSquadInvitations({
      plan, players: verifiedPlayers, invitedByUid: user.uid, now,
    });
    const basis = createHash("sha256")
      .update(JSON.stringify({plan, players: verifiedPlayers})).digest("hex");

    if (context.squad) {
      if (context.squad.creationBasis === basis) {
        return {squadId: context.squadRef.id, status: "existing"};
      }
      throw new Error(
        "Season invitations already exist. Agreed amounts cannot be overwritten."
      );
    }
    tx.set(context.squadRef, {
      ...scope, version: 1, status: "active",
      plan, creationBasis: basis,
      entries: Object.fromEntries(invitations.map(item => [item.memberId, item])),
      createdByUid: user.uid, createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {squadId: context.squadRef.id, status: "created"};
  });
}

async function respondSeasonInvitation({db, user, body, now = Date.now()}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {venueId, seasonId, clubId, memberId, response} = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  if (!validId(memberId)) throw new Error("Invalid invited member.");
  const policy = await import("./fieldSeasonSquadPolicy.mjs");
  return db.runTransaction(async tx => {
    const context = await loadContext(tx, db, scope);
    const memberSnap = await tx.get(
      context.clubRef.collection("members").doc(memberId)
    );
    const member = memberSnap.data();
    const invitation = context.squad?.entries?.[memberId];
    if (!ownsMember(member, user) || !invitation ||
        member.playerId !== invitation.sourcePlayerId) {
      throw new Error("Sign in as the invited Club member.");
    }
    const playerSnap = await tx.get(context.clubRef.collection("players")
      .doc(invitation.sourcePlayerId));
    if (!playerSnap.exists ||
        String(playerSnap.data().status || "active").toLowerCase() !== "active") {
      throw new Error("The invited player is no longer active.");
    }
    const next = policy.respondSeasonSquadInvitation({
      invitation, response, actorMemberId: memberId, now,
    });
    if (next !== invitation) {
      tx.update(context.squadRef, {
        entries: {...context.squad.entries, [memberId]: {
          ...next, respondedByUid: user.uid,
        }},
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return {memberId, invitationStatus: next.invitationStatus};
  });
}

async function confirmSeasonPayment({db, user, body, now = Date.now()}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {venueId, seasonId, clubId, memberId} = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  if (!validId(memberId)) throw new Error("Invalid squad member.");
  const policy = await import("./fieldSeasonSquadPolicy.mjs");
  return db.runTransaction(async tx => {
    const context = await loadContext(tx, db, scope);
    if (!canManageSquad(context.club, user)) {
      throw new Error("Only this Club's administrator or captain can confirm payment.");
    }
    const invitation = context.squad?.entries?.[memberId];
    if (!invitation) throw new Error("This player has no season invitation.");
    const memberSnap = await tx.get(context.clubRef.collection("members")
      .doc(memberId));
    const playerSnap = await tx.get(context.clubRef.collection("players")
      .doc(invitation.sourcePlayerId));
    if (memberSnap.data()?.status !== "active" ||
        memberSnap.data()?.playerId !== invitation.sourcePlayerId ||
        !playerSnap.exists ||
        String(playerSnap.data().status || "active").toLowerCase() !== "active") {
      throw new Error("Check this player's active Club membership.");
    }
    const next = policy.confirmSeasonSquadPayment({
      invitation, confirmedByUid: user.uid, now,
    });
    if (next !== invitation) {
      tx.update(context.squadRef, {
        entries: {...context.squad.entries, [memberId]: next},
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(context.squadRef.collection("paymentConfirmations").doc(memberId), {
        ...scope, memberId, sourcePlayerId: invitation.sourcePlayerId,
        amountCents: next.paidCents, currency: "ZAR",
        confirmedByUid: user.uid, confirmedAt: FieldValue.serverTimestamp(),
        method: "captain_confirmed_receipt",
      });
    }
    return {memberId, paymentStatus: next.paymentStatus};
  });
}

exports.squadId = squadId;
exports.canManageSquad = canManageSquad;
exports.ownsMember = ownsMember;
exports.createSeasonSquad = createSeasonSquad;
exports.respondSeasonInvitation = respondSeasonInvitation;
exports.confirmSeasonPayment = confirmSeasonPayment;

async function setSeasonMatchDayAvailability({db, user, body}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {
    venueId, seasonId, clubId, matchDayId, memberId, available,
  } = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  if (!validId(matchDayId) || !validId(memberId) ||
      typeof available !== "boolean") {
    throw new Error("Choose a player, match day and availability.");
  }
  const policy = await import("./fieldSeasonAvailabilityPolicy.mjs");
  return db.runTransaction(async tx => {
    const context = await loadContext(tx, db, scope);
    const squad = context.squad;
    if (!squad || squad.version !== 1 || squad.status !== "active" ||
        ["venueId", "seasonId", "clubId"].some(
          key => squad[key] !== scope[key]
        )) {
      throw new Error("An active season squad is required.");
    }
    const liveSnap = await tx.get(db.doc(
      `leagueVenues/${venueId}/seasons/${seasonId}/matches/current`
    ));
    policy.assertClubMatchDayEditable({
      season: context.season, clubId, matchDayId,
      liveMatch: liveSnap.data() || null,
    });

    const entry = squad.entries?.[memberId];
    if (!entry || entry.memberId !== memberId ||
        !validId(entry.sourcePlayerId)) {
      throw new Error("This player is not in the season squad.");
    }
    const memberSnap = await tx.get(
      context.clubRef.collection("members").doc(memberId)
    );
    const profileSnap = await tx.get(
      context.clubRef.collection("players").doc(entry.sourcePlayerId)
    );
    const member = memberSnap.data();
    const profile = profileSnap.data();
    const manager = canManageSquad(context.club, user);
    if (!manager && !ownsMember(member, user)) {
      throw new Error("Only this player or their Club captain/admin can change availability.");
    }
    if (member?.status !== "active" ||
        member.playerId !== entry.sourcePlayerId || !profile ||
        String(profile.status || "active").toLowerCase() !== "active") {
      throw new Error("The player needs an active matching Club membership.");
    }

    const status = policy.nextPlayerAvailability({
      entry, available, actorMemberId: memberId,
    });
    const replacement = squad.matchDayReplacements?.[matchDayId]?.[memberId];
    if (available && replacement &&
        ["pending", "accepted"].includes(replacement.invitationStatus)) {
      throw new Error("Ask your captain to remove the replacement before returning to this game.");
    }
    const previous = squad.matchDayAvailability?.[matchDayId]?.[memberId];
    if (previous?.status === status) return {status, unchanged: true};

    tx.update(context.squadRef, {
      [`matchDayAvailability.${matchDayId}.${memberId}`]: {
        status, changedByUid: user.uid,
        changedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {status};
  });
}

async function loadReplacementContext(tx, db, scope, matchDayId) {
  if (!validId(matchDayId)) throw new Error("Choose a valid match day.");
  const context = await loadContext(tx, db, scope);
  const squad = context.squad;
  if (!squad || squad.version !== 1 || squad.status !== "active" ||
      ["venueId", "seasonId", "clubId"].some(key => squad[key] !== scope[key])) {
    throw new Error("An active season squad is required.");
  }
  const liveSnap = await tx.get(db.doc(
    `leagueVenues/${scope.venueId}/seasons/${scope.seasonId}/matches/current`
  ));
  const policy = await import("./fieldSeasonAvailabilityPolicy.mjs");
  policy.assertClubMatchDayEditable({
    season: context.season, clubId: scope.clubId, matchDayId,
    liveMatch: liveSnap.data() || null,
  });
  return {...context, policy};
}

async function assertReplacementPlace(tx, context, scope, matchDayId, originalMemberId) {
  const original = context.squad.entries?.[originalMemberId];
  if (!original || original.memberId !== originalMemberId ||
      original.invitationStatus !== "accepted" ||
      original.paymentStatus !== "paid" ||
      context.squad.matchDayAvailability?.[matchDayId]?.[originalMemberId]
        ?.status !== "unavailable") {
    throw new Error("Choose an unavailable player with a confirmed season payment.");
  }
  const receiptSnap = await tx.get(context.squadRef
    .collection("paymentConfirmations").doc(originalMemberId));
  const receipt = receiptSnap.data();
  if (!receipt || ["venueId", "seasonId", "clubId"]
    .some(key => receipt[key] !== scope[key]) ||
      receipt.memberId !== originalMemberId ||
      receipt.sourcePlayerId !== original.sourcePlayerId ||
      receipt.currency !== "ZAR" ||
      !Number.isSafeInteger(original.contributionCents) ||
      original.contributionCents <= 0 ||
      original.paidCents !== original.contributionCents ||
      receipt.amountCents !== original.contributionCents ||
      !original.paymentConfirmedByUid ||
      receipt.confirmedByUid !== original.paymentConfirmedByUid) {
    throw new Error("The original season payment receipt does not match this place.");
  }
  return original;
}

async function loadReplacementPlayer(tx, context, memberId, sourcePlayerId) {
  if (!validId(memberId) || !validId(sourcePlayerId)) {
    throw new Error("Choose a registered replacement player.");
  }
  const memberSnap = await tx.get(
    context.clubRef.collection("members").doc(memberId)
  );
  const profileSnap = await tx.get(
    context.clubRef.collection("players").doc(sourcePlayerId)
  );
  const member = memberSnap.data();
  const profile = profileSnap.data();
  if (member?.status !== "active" || member.playerId !== sourcePlayerId ||
      !profile || String(profile.status || "active").toLowerCase() !== "active") {
    throw new Error("The replacement needs an active matching Club membership.");
  }
  const fullName = String(profile.fullName || profile.displayName ||
    profile.name || profile.playerName || "").trim();
  if (!fullName) throw new Error("The replacement needs a registered name.");
  return {member, player: {memberId, sourcePlayerId, fullName}};
}

async function inviteSeasonMatchDayReplacement({db, user, body}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {venueId, seasonId, clubId, matchDayId, originalMemberId,
    memberId, sourcePlayerId} = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  if (!validId(originalMemberId)) throw new Error("Choose the unavailable player.");
  return db.runTransaction(async tx => {
    const context = await loadReplacementContext(tx, db, scope, matchDayId);
    if (!canManageSquad(context.club, user)) {
      throw new Error("Only this Club's captain or administrator can invite cover.");
    }
    const original = await assertReplacementPlace(
      tx, context, scope, matchDayId, originalMemberId
    );
    const {player} = await loadReplacementPlayer(tx, context, memberId, sourcePlayerId);
    const existing = context.squad.matchDayReplacements?.[matchDayId] || {};
    const previous = existing[originalMemberId];
    if (previous && ["pending", "accepted"].includes(previous.invitationStatus)) {
      if (previous.memberId === memberId &&
          previous.sourcePlayerId === sourcePlayerId) {
        return {status: previous.invitationStatus, unchanged: true};
      }
      throw new Error("Remove the existing replacement before selecting another.");
    }
    if (Object.values(context.squad.entries || {}).some(entry =>
      entry.memberId === memberId || entry.sourcePlayerId === sourcePlayerId)) {
      throw new Error("Choose cover from outside the season squad.");
    }
    if (Object.values(existing).some(entry =>
      ["pending", "accepted"].includes(entry.invitationStatus) &&
      (entry.memberId === memberId || entry.sourcePlayerId === sourcePlayerId))) {
      throw new Error("This player already covers another place on this match day.");
    }
    const replacement = context.policy.createMatchDayReplacement({
      original, originalAvailability: "unavailable",
      replacement: player, actorUid: user.uid,
    });
    tx.update(context.squadRef, {
      [`matchDayReplacements.${matchDayId}.${originalMemberId}`]: {
        ...replacement, invitedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {status: "pending"};
  });
}

async function respondSeasonMatchDayReplacement({db, user, body}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {venueId, seasonId, clubId, matchDayId, originalMemberId,
    response} = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  if (!validId(originalMemberId) || !["accepted", "declined"].includes(response)) {
    throw new Error("Choose a valid invitation response.");
  }
  return db.runTransaction(async tx => {
    const context = await loadReplacementContext(tx, db, scope, matchDayId);
    await assertReplacementPlace(tx, context, scope, matchDayId, originalMemberId);
    const replacement = context.squad.matchDayReplacements?.[matchDayId]?.[originalMemberId];
    if (!replacement) throw new Error("This replacement invitation no longer exists.");
    const {member} = await loadReplacementPlayer(
      tx, context, replacement.memberId, replacement.sourcePlayerId
    );
    if (!ownsMember(member, user)) {
      throw new Error("Only the invited replacement can respond.");
    }
    if (replacement.invitationStatus === response) {
      return {status: response, unchanged: true};
    }
    if (replacement.invitationStatus !== "pending") {
      throw new Error("This invitation has already been answered or cancelled.");
    }
    tx.update(context.squadRef, {
      [`matchDayReplacements.${matchDayId}.${originalMemberId}`]: {
        ...replacement, invitationStatus: response,
        respondedByUid: user.uid, respondedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {status: response};
  });
}

async function cancelSeasonMatchDayReplacement({db, user, body}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {venueId, seasonId, clubId, matchDayId, originalMemberId} = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  if (!validId(originalMemberId)) throw new Error("Choose a valid squad place.");
  return db.runTransaction(async tx => {
    const context = await loadReplacementContext(tx, db, scope, matchDayId);
    if (!canManageSquad(context.club, user)) {
      throw new Error("Only this Club's captain or administrator can remove cover.");
    }
    const replacement = context.squad.matchDayReplacements?.[matchDayId]?.[originalMemberId];
    if (!replacement) throw new Error("No replacement exists for this place.");
    if (replacement.invitationStatus === "cancelled") {
      return {status: "cancelled", unchanged: true};
    }
    tx.update(context.squadRef, {
      [`matchDayReplacements.${matchDayId}.${originalMemberId}`]: {
        ...replacement, invitationStatus: "cancelled",
        cancelledByUid: user.uid, cancelledAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {status: "cancelled"};
  });
}

async function getSeasonSquadView({db, user, body}) {
  if (!user?.uid) throw new Error("Sign in first.");
  const {venueId, seasonId, clubId} = body || {};
  const scope = {venueId, seasonId, clubId};
  squadId(scope);
  return db.runTransaction(async tx => {
    const context = await loadContext(tx, db, scope);
    const manager = canManageSquad(context.club, user);
    if (manager) {
      return {
        squadId: context.squadRef.id, canManage: true,
        squad: context.squad || null,
      };
    }
    if (!context.squad) return {canManage: false, invitation: null};

    const entries = Object.values(context.squad.entries || {});
    const own = [];
    for (const entry of entries) {
      if (!validId(entry.memberId)) continue;
      const memberSnap = await tx.get(
        context.clubRef.collection("members").doc(entry.memberId)
      );
      const member = memberSnap.data();
      if (ownsMember(member, user) &&
          member.playerId === entry.sourcePlayerId) own.push(entry);
    }
    if (own.length > 1) {
      throw new Error("Your account matches multiple squad members. Ask the Club admin to fix the links.");
    }
    return {
      squadId: context.squadRef.id, canManage: false,
      invitation: own[0] || null,
    };
  });
}

function squadEndpoint(operation) {
  const {onRequest} = require("firebase-functions/v2/https");
  return onRequest({
    region: "us-central1", invoker: "public", cors: true,
  }, async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Use POST."});
    }
    const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
    if (!bearer) return res.status(401).json({error: "Sign in first."});
    let user;
    try {
      user = await require("firebase-admin").auth().verifyIdToken(bearer[1], true);
      if (user.cameraSession === true || user.cameraSessionId || user.cameraHandoffId) {
        return res.status(403).json({error: "Use your Club sign-in."});
      }
    } catch {
      return res.status(401).json({error: "Sign in again."});
    }
    try {
      const {getFirestore} = require("firebase-admin/firestore");
      const result = await operation({db: getFirestore(), user, body: req.body});
      return res.status(200).json(result);
    } catch (error) {
      console.error("[Season squad]", error);
      return res.status(400).json({error: error.message || "Could not update the season squad."});
    }
  });
}

exports.getSeasonSquadView = getSeasonSquadView;
exports.createFieldSeasonSquad = squadEndpoint(createSeasonSquad);
exports.respondFieldSeasonSquad = squadEndpoint(respondSeasonInvitation);
exports.confirmFieldSeasonSquadPayment = squadEndpoint(confirmSeasonPayment);
exports.getFieldSeasonSquad = squadEndpoint(getSeasonSquadView);

exports.setSeasonMatchDayAvailability = setSeasonMatchDayAvailability;
exports.setFieldSeasonMatchDayAvailability =
  squadEndpoint(setSeasonMatchDayAvailability);

exports.inviteSeasonMatchDayReplacement = inviteSeasonMatchDayReplacement;
exports.inviteFieldMatchDayReplacement = squadEndpoint(inviteSeasonMatchDayReplacement);

exports.respondSeasonMatchDayReplacement = respondSeasonMatchDayReplacement;
exports.respondFieldMatchDayReplacement = squadEndpoint(respondSeasonMatchDayReplacement);

exports.cancelSeasonMatchDayReplacement = cancelSeasonMatchDayReplacement;
exports.cancelFieldMatchDayReplacement = squadEndpoint(cancelSeasonMatchDayReplacement);
