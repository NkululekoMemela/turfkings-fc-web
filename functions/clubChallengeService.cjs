"use strict";

const {createHash} = require("node:crypto");
const {checkedPatch, takeoverWindow, takeoverReady} = require("./fieldBoothPolicy.cjs");

const FORMATS = new Set(["5v5", "6v6", "7v7", "11v11"]);
const COLLECTION = "clubChallengeMatches";
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,120}$/;

class ChallengeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const invalid = (message) => new ChallengeError("invalid-argument", message);
const forbidden = (message) => new ChallengeError("permission-denied", message);
const normaliseEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";
const text = (value) => typeof value === "string" ? value.trim() : "";

function clubId(value) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw invalid("Choose a valid Club.");
  return value;
}

function requireVerifiedUser(user) {
  if (!user?.uid || user.email_verified !== true || !normaliseEmail(user.email) ||
      user.cameraSession || user.practiceSession || user.firebase?.sign_in_provider === "anonymous") {
    throw forbidden("Sign in with your verified captain account.");
  }
}

async function requireCaptain(tx, db, id, club, user, allowAdmin = false) {
  const email = normaliseEmail(user.email);
  const configured = [
    club.captainEmail, club.captain?.email,
    ...(Array.isArray(club.captainEmails) ? club.captainEmails : []),
  ].map(normaliseEmail);
  if (configured.includes(email)) return;

  const access = await tx.get(db.doc(`clubStateOperators/${id}/users/${user.uid}`));
  const memberId = access.data()?.memberId;
  if (typeof memberId === "string" && memberId && !memberId.includes("/")) {
    const member = (await tx.get(db.doc(`clubs/${id}/members/${memberId}`))).data();
    if (member?.status === "active" && (member.role === "captain" || (allowAdmin && member.role === "admin")) &&
        (member.uid === user.uid || (!member.uid && normaliseEmail(member.email) === email))) return;
  }

  throw forbidden("Only a captain of this Club can respond to or send a challenge.");
}

const EXHIBITION_CAPACITY = 15;
const SQUAD_READY_COUNT = 12;
const MAX_CLUB_TOTAL_CENTS = 100000000;
const isClubAdmin = (club, user) =>
  [club.ownerUid, club.createdByUid, ...(Array.isArray(club.adminUids) ? club.adminUids : [])].includes(user.uid) ||
  (Array.isArray(club.adminEmails) ? club.adminEmails : []).map(normaliseEmail).includes(normaliseEmail(user.email));

async function requireManager(tx, db, id, club, user) {
  if (!isClubAdmin(club, user)) await requireCaptain(tx, db, id, club, user, true);
}

async function verifiedMember(tx, db, id, user) {
  const collection = db.collection(`clubs/${id}/members`);
  const byUid = await tx.get(collection.where("uid", "==", user.uid).limit(5));
  let doc = byUid.docs.find((record) => record.data().status === "active");
  if (!doc) {
    const byEmail = await tx.get(collection.where("email", "==", normaliseEmail(user.email)).limit(5));
    doc = byEmail.docs.find((record) => {
      const member = record.data();
      return member.status === "active" && !member.uid;
    });
  }
  if (!doc) return null;
  const member = doc.data();
  const name = text(member.shortName || member.fullName || member.displayName || member.name);
  return name ? {memberId: doc.id, name: name.slice(0, 60)} : null;
}

function exhibitionShareCents(total, seat) {
  return Math.floor(total / EXHIBITION_CAPACITY) + (seat < total % EXHIBITION_CAPACITY ? 1 : 0);
}

const KIT_LABELS = Object.freeze({
  "#0f172a": "black", "#f8fafc": "white", "#dc2626": "red", "#f97316": "orange",
  "#facc15": "yellow", "#1d4ed8": "blue", "#38bdf8": "sky blue", "#22c55e": "green", "#7c3aed": "purple",
});

function kitChannels(hex) {
  const rgb = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = rgb;
  const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const hue = !delta ? 0 : ((60 * (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4)) + 360) % 360;
  return {rgb, hue, lightness, saturation};
}

function kitColours(homeColour, awayColour) {
  const colours = [homeColour, awayColour].map((value) => text(value).toLowerCase());
  if (!colours.every((value) => /^#[0-9a-f]{6}$/.test(value))) throw invalid("Choose two kit colours.");
  const [a, b] = colours.map(kitChannels);
  const hueGap = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue));
  const closeRgb = Math.hypot(...a.rgb.map((value, index) => value - b.rgb[index])) < 0.36;
  const similarHue = a.saturation >= 0.4 && b.saturation >= 0.4 &&
    hueGap <= 36 && Math.abs(a.lightness - b.lightness) < 0.32;
  if (closeRgb || similarHue) throw invalid("Those kits are too similar. Choose a colour that clearly contrasts with the opponent’s.");
  return {homeColour: colours[0], awayColour: colours[1]};
}

async function changeExhibitionKit({db, user, data, now = Date.now()}) {
  const colour = text(data?.colour).toLowerCase();
  if (!Object.hasOwn(KIT_LABELS, colour)) throw invalid("Choose a kit colour from the list.");
  return withFixture({db, user, data}, async ({tx, ref, match, side}) => {
    if (match.status !== "accepted" || match.kickoffMs <= now) throw invalid("You can change kits before kickoff.");
    const key = `${side}Colour`;
    if (match[key] === colour) return {colour, unchanged: true};
    const opponent = side === "home" ? "away" : "home";
    if (match[`${opponent}Colour`]) {
      kitColours(side === "home" ? colour : match.homeColour, side === "away" ? colour : match.awayColour);
    }
    tx.update(ref, {[key]: colour, kitUpdate: null, updatedAtMs: now});
    return {colour};
  });
}

function fixtureTerms(data, now) {
  const proposedDate = text(data.proposedDate);
  const proposedKickoff = text(data.proposedKickoff);
  const venue = text(data.venue);
  const message = text(data.message);
  if (!FORMATS.has(data.format)) throw invalid("Choose 5-, 6-, 7- or 11-a-side.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposedDate) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(proposedKickoff)) {
    throw invalid("Choose a date and kickoff time.");
  }
  const localMidnight = new Date(`${proposedDate}T00:00:00Z`);
  if (!Number.isFinite(localMidnight.valueOf()) || localMidnight.toISOString().slice(0, 10) !== proposedDate) {
    throw invalid("Choose a real calendar date.");
  }
  const kickoffMs = Date.parse(`${proposedDate}T${proposedKickoff}:00+02:00`);
  if (kickoffMs <= now) throw invalid("Choose a future kickoff time (SAST).");
  if (!venue || venue.length > 140) throw invalid("Enter a venue of up to 140 characters.");
  if (message.length > 600) throw invalid("Keep the optional message to 600 characters.");
  const clubTotalCents = data.clubTotalCents;
  if (!Number.isSafeInteger(clubTotalCents) || clubTotalCents < 0 || clubTotalCents > MAX_CLUB_TOTAL_CENTS) {
    throw invalid("Enter the amount each Club must collect, in rand.");
  }
  return {format: data.format, proposedDate, proposedKickoff, kickoffMs, venue, message, clubTotalCents};
}

function clubDisplay(id, club) {
  return {
    id,
    name: text(club.name || club.clubName || club.shortName) || "Club",
    logoUrl: text(club.logoUrl || club.badgeUrl || club.image),
  };
}

async function getClub(tx, db, id) {
  const club = (await tx.get(db.doc(`clubs/${id}`))).data();
  if (!club || club.deleted === true || club.archived === true ||
      club.organizationArchive?.active === true || ["archived", "deleted"].includes(club.status)) {
    throw new ChallengeError("not-found", "This Club is unavailable.");
  }
  return club;
}

async function sendClubChallenge({db, user, data, now = Date.now()}, instigated = false) {
  requireVerifiedUser(user);
  if (instigated && normaliseEmail(user.email) !== "nkululekolerato@gmail.com") {
    throw forbidden("Use your verified platform administrator account.");
  }
  const homeId = clubId(data?.homeClubId);
  const awayId = clubId(data?.awayClubId);
  if (homeId === awayId) throw invalid("Choose another Club to challenge.");
  const terms = fixtureTerms(data, now);
  const hostedPackage = instigated && terms.format === "11v11" ? {
    rosterPerClub: 15, waterPerClub: 24, waterMl: 500,
    fieldBooking: true, referee: true, cameraOperator: true,
  } : null;
  if (hostedPackage && terms.clubTotalCents !== 220000) {
    throw invalid("The FANM 11-a-side package is R2,200 per Club.");
  }
  if (instigated && terms.clubTotalCents <= 0) throw invalid("Enter a FANM package quote per Club.");
  const colours = kitColours(data.homeColour, data.awayColour);
  const pair = [homeId, awayId].sort();
  const fixtureId = createHash("sha256").update(JSON.stringify([...pair, terms.kickoffMs])).digest("hex");
  const ref = db.doc(`${COLLECTION}/${fixtureId}`);
  return db.runTransaction(async (tx) => {
    const home = await getClub(tx, db, homeId);
    if (!instigated) await requireCaptain(tx, db, homeId, home, user);
    const away = await getClub(tx, db, awayId);
    if (instigated && [home, away].some((club) => club.clubType === "company")) {
      throw invalid("Choose two community Clubs for a FANM Challenge.");
    }
    const existing = (await tx.get(ref)).data();
    if (existing) {
      const identical = existing.home?.id === homeId && existing.status === "pending" &&
        Boolean(existing.instigated) === instigated &&
        ["format", "venue", "message", "clubTotalCents", "homeColour", "awayColour"].every((key) => existing[key] === {...terms, ...colours}[key]);
      if (identical) return {fixtureId, status: existing.status};
      throw new ChallengeError("already-exists", "These Clubs already have a challenge at this kickoff.");
    }
    tx.create(ref, {
      ...terms, ...colours, ...(hostedPackage ? {hostedPackage} : {}), fixtureId, source: "club_challenge", revision: 1,
      status: "pending", instigated, acceptances: {home: !instigated, away: false}, home: clubDisplay(homeId, home), away: clubDisplay(awayId, away),
      participatingClubIds: pair, createdAtMs: now, updatedAtMs: now,
    });
    return {fixtureId, status: "pending"};
  });
}

async function respondToClubChallenge({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const fixtureId = text(data?.fixtureId);
  const decision = data?.decision;
  if (!/^[a-f0-9]{64}$/.test(fixtureId) || !["accepted", "declined"].includes(decision)) {
    throw invalid("Choose a challenge and a response.");
  }

  return db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTION}/${fixtureId}`);
    const match = (await tx.get(ref)).data();
    if (!match) throw new ChallengeError("not-found", "This challenge is unavailable.");
    const id = clubId(data?.clubId ?? match.away.id);
    if (!match.participatingClubIds?.includes(id)) throw forbidden("This invitation is for another Club.");
    const club = await getClub(tx, db, id);
    await requireCaptain(tx, db, id, club, user);
    const side = match.home.id === id ? "home" : "away";
    const acceptances = match.acceptances || {home: !match.instigated, away: false};
    if (side === "home" && !match.instigated && !match.revisedBy) throw forbidden("The other captain must respond to this invitation.");
    if (match.status === decision) return {fixtureId, status: decision};
    if (match.status !== "pending" || (decision === "accepted" && match.kickoffMs <= now)) {
      throw new ChallengeError("failed-precondition", "This challenge can no longer be accepted or declined.");
    }
    if (data.revision !== (match.revision || 0)) throw new ChallengeError("failed-precondition", "The fixture terms have changed. Review them again.");
    if (acceptances[side] && decision === "declined") throw forbidden("Use Withdraw challenge to pull out.");
    let status = decision;
    const extra = {};
    if (decision === "accepted") {
      kitColours(match.homeColour, match.awayColour);
      extra.acceptances = {...acceptances, [side]: true};
      status = extra.acceptances.home && extra.acceptances.away ? "accepted" : "pending";
    }
    tx.update(ref, {...extra, status, ...(status === "accepted" ? {acceptedAtMs: now} : {}), respondedAtMs: now, updatedAtMs: now});
    return {fixtureId, status, ...extra};
  });
}


async function reviseClubChallenge({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (!/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose an exhibition.");
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTION}/${fixtureId}`);
    const match = (await tx.get(ref)).data();
    if (!match?.participatingClubIds?.includes(id)) throw forbidden("This fixture belongs to another Club.");
    await requireCaptain(tx, db, id, await getClub(tx, db, id), user);
    if (data.postponementAction) {
      if (match.status !== "accepted" || match.kickoffMs <= now || match.cancellation?.outcome === "pending") {
        throw invalid("Only an upcoming exhibition without a pending cancellation can be postponed.");
      }
      const proposal = match.postponement;
      if (data.postponementAction === "request") {
        if (proposal?.status === "pending" && proposal.byClubId !== id) throw invalid("Review the other captain’s request first.");
        const reason = text(data.reason);
        if (!reason || reason.length > 500) throw invalid("Enter a postponement reason of up to 500 characters.");
        const {proposedDate, proposedKickoff, kickoffMs} = fixtureTerms({...match,
          proposedDate:data.proposedDate, proposedKickoff:data.proposedKickoff}, now);
        if (kickoffMs <= match.kickoffMs) throw invalid("Choose a kickoff later than the current fixture.");
        const next = {status:"pending",byClubId:id,reason,proposedDate,proposedKickoff,kickoffMs,requestedAtMs:now};
        tx.update(ref, {postponement:next,updatedAtMs:now});
        return {fixtureId,status:"accepted",postponement:next};
      }
      if (proposal?.status !== "pending" || proposal.byClubId === id || data.requestedAtMs !== proposal.requestedAtMs ||
          !["agree","decline"].includes(data.postponementAction)) throw invalid("Review the latest postponement request.");
      const agreed = data.postponementAction === "agree";
      if (agreed) {
        const rows = await tx.get(db.collection(COLLECTION).where("participatingClubIds","array-contains",id));
        if (rows.docs.some(doc => {
          const item=doc.data();
          return item.fixtureId!==fixtureId && item.kickoffMs===proposal.kickoffMs &&
            ["pending","accepted","live"].includes(item.status) && item.participatingClubIds?.some(club=>club!==id && match.participatingClubIds.includes(club));
        })) throw invalid("These Clubs already have a challenge at that kickoff.");
      }
      const next={...proposal,status:agreed?"agreed":"declined",decidedAtMs:now};
      tx.update(ref,{postponement:next,updatedAtMs:now,...(agreed?{
        proposedDate:proposal.proposedDate,proposedKickoff:proposal.proposedKickoff,kickoffMs:proposal.kickoffMs,
      }:{})});
      return {fixtureId,status:"accepted",postponement:next};
    }
    if (data.withdraw === true || data.cancellationAction) {
      return applyCancellation({tx, ref, match, id, data, now});
    }
    if (match.status !== "pending" || data.revision !== (match.revision || 0)) {
      throw new ChallengeError("failed-precondition", "The proposal has changed. Review the latest terms.");
    }
    const colours = kitColours(data.homeColour, data.awayColour);
    const terms = fixtureTerms({...match, venue: data.venue, proposedDate: data.proposedDate,
      proposedKickoff: data.proposedKickoff, message: data.message}, now);
    const side = match.home.id === id ? "home" : "away";
    const revision = (match.revision || 0) + 1;
    tx.update(ref, {...terms, ...colours, acceptances: {home: side === "home", away: side === "away"},
      revision, revisedBy: id, updatedAtMs: now});
    return {fixtureId, status: "pending", revision};
  });
}

const HOUR = 3600000;
const FOUR_HOUR_NOTICE = 4 * HOUR;
const SCHEDULER_MARGIN = 60000;

function finalizeCancellation(tx, ref, cancellation, now, outcome) {
  tx.update(ref, {status: "withdrawn", cancellation: {...cancellation, outcome}, cancellationDueMs: null,
    withdrawnBy: cancellation.byClubId, withdrawnAtMs: now, postponement:null, updatedAtMs: now});
}

function applyCancellation({tx, ref, match, id, data, now}) {
  const fixtureId = match.fixtureId;
  const current = match.cancellation;
  const action = data.cancellationAction || "request";
  if (now >= match.kickoffMs) throw invalid("The scheduled kickoff has passed.");
  if (action === "restore") {
    if (match.status !== "withdrawn" || !current || !current.wasAgreed) {
      throw invalid("Only a previously agreed exhibition can be restored.");
    }
    if (current.restoreBy === id) return {fixtureId, status: "withdrawn", restoreRequested: true};
    if (!current.restoreBy) {
      tx.update(ref, {cancellation: {...current, restoreBy: id}, updatedAtMs: now});
      return {fixtureId, status: "withdrawn", restoreRequested: true};
    }
    tx.update(ref, {status: "accepted", cancellation: {...current, outcome: "restored", restoredAtMs: now},
      cancellationDueMs: null, updatedAtMs: now});
    return {fixtureId, status: "accepted"};
  }
  if (match.status === "withdrawn") return {fixtureId, status: "withdrawn"};
  if (!["accepted", "pending"].includes(match.status)) throw invalid("A match already underway cannot be cancelled.");
  const late = match.kickoffMs - now <= FOUR_HOUR_NOTICE + SCHEDULER_MARGIN;
  if (action === "request" || action === "force") {
    if (action === "force" && !late) throw invalid("Immediate cancellation is only available close to kickoff.");
    if (current?.outcome === "pending" && action === "request") return {fixtureId, status: "accepted", cancellationPending: true};
    if (current?.outcome === "pending" && current.byClubId !== id) throw invalid("Review the existing cancellation request.");
    const reason = text(data.reason);
    if (!reason || reason.length > 500) throw invalid("Enter a cancellation reason of up to 500 characters.");
    const dueMs = Math.min(now + 12 * HOUR, match.kickoffMs - FOUR_HOUR_NOTICE - SCHEDULER_MARGIN);
    const cancellation = {reason, byClubId: id, requestedAtMs: now, dueMs, wasAgreed: match.status === "accepted", outcome: "pending"};
    if (action === "force" || match.status === "pending") {
      finalizeCancellation(tx, ref, cancellation, now, "cancelled");
      return {fixtureId, status: "withdrawn"};
    }
    if (late) throw invalid("Kickoff is too close to wait. Choose Cancel now to confirm.");
    tx.update(ref, {cancellation, cancellationDueMs: dueMs, updatedAtMs: now});
    return {fixtureId, status: "accepted", cancellationPending: true};
  }
  if (current?.outcome !== "pending") throw invalid("There is no cancellation request to review.");
  if (now >= current.dueMs) {
    finalizeCancellation(tx, ref, current, now, "timed_out");
    return {fixtureId, status: "withdrawn"};
  }
  if (action === "acknowledge" && current.byClubId !== id) {
    finalizeCancellation(tx, ref, current, now, "acknowledged");
    return {fixtureId, status: "withdrawn"};
  }
  if (action === "suggest" && current.byClubId !== id) {
    const suggestion = text(data.suggestion);
    if (!suggestion || suggestion.length > 500) throw invalid("Enter an alternative of up to 500 characters.");
    tx.update(ref, {cancellation: {...current, suggestion, suggestedAtMs: now}, updatedAtMs: now});
    return {fixtureId, status: "accepted", cancellationPending: true};
  }
  if (action === "keep" && current.byClubId === id) {
    tx.update(ref, {cancellation: {...current, outcome: "kept", resolvedAtMs: now}, cancellationDueMs: null, updatedAtMs: now});
    return {fixtureId, status: "accepted"};
  }
  throw forbidden("Your Club cannot take that action.");
}

async function expireExhibitionCancellations(db, now = Date.now()) {
  const due = await db.collection(COLLECTION).where("cancellationDueMs", ">", 0)
    .where("cancellationDueMs", "<=", now).limit(100).get();
  await Promise.all(due.docs.map(({ref}) => db.runTransaction(async (tx) => {
    const match = (await tx.get(ref)).data();
    if (match?.status === "accepted" && match.cancellation?.outcome === "pending" && match.cancellation.dueMs <= now) {
      finalizeCancellation(tx, ref, match.cancellation, now, "timed_out");
    }
  })));
}

async function listClubChallenges({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  return db.runTransaction(async (tx) => {
    const club = await getClub(tx, db, id);
    if (data.accessOnly === true) {
      await requireCaptain(tx, db, id, club, user);
      return {allowed: true};
    }
    await requireManager(tx, db, id, club, user);
    let canRespondToInvitations = true;
    try { await requireCaptain(tx, db, id, club, user); }
    catch (error) {
      if (error.code !== "permission-denied") throw error;
      canRespondToInvitations = false;
    }
    const matches = await tx.get(db.collection(COLLECTION)
      .where("participatingClubIds", "array-contains", id));
    return {matches: matches.docs.map((doc) => {
      const {bookings, ...match} = doc.data();
      const side = match.home.id === id ? "home" : "away";
      match.signedPlayers = Object.values(bookings?.[side] || {}).map(({name, memberId, priceCents, cashPaidAtMs}) =>
        ({name, memberId, priceCents: priceCents ?? null, cashPaid: Boolean(cashPaidAtMs)}));
      const opposite = side === "home" ? "away" : "home";
      if (match.teams?.[opposite]) {
        const {starters, substitutes} = match.teams[opposite];
        match.teams = {...match.teams, [opposite]: {starters, substitutes}};
      }
      if (!match.live) return match;
      const {controller, request, ...live} = match.live;
      return {...match, live: {...live, controller: {clubId: controller.clubId,
        device: controller.uid === user.uid ? controller.device : null},
        request: request ? {clubId: request.clubId,
          device: request.uid === user.uid ? request.device : null} : null}};
    })
      .sort((a, b) => b.createdAtMs - a.createdAtMs).filter((match, index) => index < 40 ||
      (match.kickoffMs > now && ["pending", "accepted", "withdrawn"].includes(match.status))), serverNowMs: now, canRespondToInvitations};
  });
}

async function exhibitionOverview({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  return db.runTransaction(async (tx) => {
    const club = await getClub(tx, db, id);
    let canManage = true;
    try { await requireManager(tx, db, id, club, user); }
    catch (error) {
      if (error.code !== "permission-denied") throw error;
      canManage = false;
    }
    const member = await verifiedMember(tx, db, id, user);
    if (!member && !canManage) throw forbidden("Join this Club before booking an exhibition match.");
    const snapshot = await tx.get(db.collection(COLLECTION).where("participatingClubIds", "array-contains", id));
    const localDayStart = Math.floor((now + 7200000) / 86400000) * 86400000 - 7200000;
    const fixtures = [];
    const playerNotices = [];
    for (const doc of snapshot.docs) {
      const match = doc.data();
      const side = match.home.id === id ? "home" : "away";
      const opponent = match[side === "home" ? "away" : "home"];
      const restoredAt = match.cancellation?.restoredAtMs;
      const postponedAt = match.postponement?.status === "agreed" ? match.postponement.decidedAtMs : 0;
      const latestChange = Math.max(restoredAt || 0, postponedAt || 0, match.acceptedAtMs || 0);
      const notice = match.status === "withdrawn" && match.cancellation?.wasAgreed && match.withdrawnAtMs > now - 86400000
        ? {type: "cancelled", at: match.withdrawnAtMs}
        : match.status === "accepted" && match.kickoffMs > now && latestChange
          ? {type: latestChange === postponedAt ? "postponed" : latestChange === restoredAt ? "restored" : "accepted", at:latestChange}
          : null;
      if (member && notice) playerNotices.push({...notice, fixtureId: match.fixtureId, opponentName: opponent.name,
        home: match.home, away: match.away, kickoffMs: match.kickoffMs, proposedDate: match.proposedDate,
        proposedKickoff: match.proposedKickoff, venue: match.venue});
      const bookingOpen = match.status === "accepted" && match.kickoffMs > now;
      if (!(match.status === "live" || (match.status === "accepted" && match.kickoffMs >= localDayStart)) ||
          !Number.isSafeInteger(match.clubTotalCents)) continue;
      const bookings = match.bookings?.[side] || {};
      const own = Object.hasOwn(bookings, user.uid) ? bookings[user.uid] : Object.values(bookings).find((entry) => entry.memberId === member?.memberId);
      const count = Object.keys(bookings).length;
      fixtures.push({
        fixtureId: match.fixtureId, opponentName: opponent.name, format: match.format,
        venue: match.venue, home: match.home, away: match.away, homeColour: match.homeColour || null,
        awayColour: match.awayColour || null, instigated: Boolean(match.instigated), cashPaid: Boolean(own?.cashPaidAtMs),
        kickoffMs: match.kickoffMs, proposedDate: match.proposedDate, proposedKickoff: match.proposedKickoff,
        capacity: EXHIBITION_CAPACITY, count, readyCount: SQUAD_READY_COUNT,
        signed: Boolean(own), status: match.status, bookingOpen,
        canBook: bookingOpen && Boolean(member) && count < EXHIBITION_CAPACITY && !own,
        priceCents: own?.priceCents ?? exhibitionShareCents(match.clubTotalCents, count),
        squadPublished: Boolean(match.teams?.[side]),
        cancellationPending: match.cancellation?.outcome === "pending",
        postponementPending: match.postponement?.status === "pending",
        signedMemberIds: canManage ? Object.values(bookings).map((entry) => entry.memberId) : [],
        cashPaidMemberIds: canManage ? Object.values(bookings).filter((entry) => entry.cashPaidAtMs).map((entry) => entry.memberId) : [],
      });
    }
    const hasChallenge = canManage && snapshot.docs.some((doc) => {
      const match = doc.data();
      return match.status === "live" || match.status === "completed" ||
        (match.status === "withdrawn" && match.kickoffMs > now) ||
        (["pending", "accepted"].includes(match.status) && match.kickoffMs > now);
    });
    const next = snapshot.docs.map((doc) => doc.data()).filter((match) =>
      match.status === "live" || (match.status === "accepted" && match.kickoffMs >= localDayStart))
      .sort((a, b) => Number(b.status === "live") - Number(a.status === "live") || a.kickoffMs - b.kickoffMs)[0];
    const nextMatch = next ? {
      fixtureId: next.fixtureId, status: next.status, kickoffMs: next.kickoffMs, format: next.format,
      proposedDate: next.proposedDate, proposedKickoff: next.proposedKickoff, venue: next.venue,
      home: next.home, away: next.away, homeColour: next.homeColour || null, awayColour: next.awayColour || null,
    } : null;
    const mediaFixtures = snapshot.docs.map((doc) => doc.data()).filter((match) => ["live", "completed"].includes(match.status))
      .sort((a,b) => b.kickoffMs - a.kickoffMs).slice(0, 30).map((match) => ({
        id: match.fixtureId, matchId: match.fixtureId, date: match.proposedDate, label: `${match.home.name} vs ${match.away.name}`,
        homeName: match.home.name, awayName: match.away.name, teamAName: match.home.name, teamBName: match.away.name,
        teamALogoUrl: match.home.logoUrl, teamBLogoUrl: match.away.logoUrl,
        homeScore: match.live?.home ?? 0, awayScore: match.live?.away ?? 0,
        goalsA: match.live?.home ?? 0, goalsB: match.live?.away ?? 0,
        status: match.status, gameFormat: match.format,
      }));
    return {canManage, hasChallenge, nextMatch, mediaFixtures, playerNotices: playerNotices.sort((a,b) => b.at-a.at), fixtures: fixtures.sort((a, b) => a.kickoffMs - b.kickoffMs)};
  });
}

async function getExhibitionMatchday({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (!/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose an exhibition match.");
  return db.runTransaction(async (tx) => {
    const club = await getClub(tx, db, id);
    const match = (await tx.get(db.doc(`${COLLECTION}/${fixtureId}`))).data();
    if (!match?.participatingClubIds?.includes(id)) throw forbidden("This exhibition is for another Club.");
    let canEdit = true;
    try { await requireManager(tx, db, id, club, user); }
    catch (error) {
      if (error.code !== "permission-denied") throw error;
      canEdit = false;
    }
    if (!canEdit && !await verifiedMember(tx, db, id, user)) throw forbidden("Join this Club to see its exhibition.");
    const side = match.home.id === id ? "home" : "away";
    const teams = Object.fromEntries(["home", "away"].map((key) => {
      const team = match.teams?.[key];
      return [key, team ? {starters: team.starters, substitutes: team.substitutes,
        ...(canEdit && key === side ? {memberIds: team.memberIds || [], captainId: team.captainId || ""} : {})} : null];
    }));
    return {fixtureId, status: match.status, format: match.format, venue: match.venue,
      proposedDate: match.proposedDate, proposedKickoff: match.proposedKickoff, home: match.home, away: match.away,
      homeColour: match.homeColour || null, awayColour: match.awayColour || null, teams, side,
      kickoffMs: match.kickoffMs, serverNowMs: now, canOperate: canEdit, live: exhibitionBoothView(match,user,canEdit,now),
      lineups: match.lineups || {}, canEdit: canEdit && match.status === "accepted",
      eligible: canEdit ? Object.values(match.bookings?.[side] || {}).map(({memberId, name}) => ({memberId, name})) : []};
  });
}

async function saveExhibitionLineup({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (!/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose an exhibition match.");
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTION}/${fixtureId}`);
    const match = (await tx.get(ref)).data();
    if (!match?.participatingClubIds?.includes(id)) throw forbidden("This exhibition is for another Club.");
    await requireManager(tx, db, id, await getClub(tx, db, id), user);
    if (match.status !== "accepted") throw invalid("Formations can only change before kickoff.");
    const side = match.home.id === id ? "home" : "away";
    if (data.teamId !== id) throw forbidden("You can only edit your Club’s formation.");
    const team = match.teams?.[side];
    if (!team) throw invalid("Set your squad first.");
    const formationId = text(data.formationId);
    const rawPositions = data.positions;
    const size = Number(match.format.split("v")[0]);
    const formations = await import("./fieldBoothShared/lineups.mjs");
    const template = formations[`FORMATIONS_${size}`]?.[formationId];
    if (!ID_PATTERN.test(formationId) || !template?.positions || !rawPositions || Array.isArray(rawPositions) ||
        typeof rawPositions !== "object" || Object.keys(rawPositions).length !== size ||
        template.positions.some(({id}) => !Object.hasOwn(rawPositions, id))) throw invalid("Choose a formation for this match format.");
    const names = new Set([...team.starters, ...team.substitutes]);
    const used = new Set();
    const positions = {};
    for (const [key, name] of Object.entries(rawPositions)) {
      if (!ID_PATTERN.test(key) || (name !== null && (!names.has(name) || used.has(name)))) throw invalid("Use unique players from your exhibition squad.");
      if (name !== null) used.add(name);
      positions[key] = name;
    }
    const lineup = {formationId, positions, benchSnapshot: [...names].filter((name) => !used.has(name))};
    tx.update(ref, {[`lineups.${side}`]: lineup, updatedAtMs: now});
    return {lineup};
  });
}

async function listExhibitionClips({db, user, data}) {
  const match = await getExhibitionMatchday({db, user, data});
  if (!["live", "completed"].includes(match.status)) return {clips: []};
  const buckets = await Promise.all([match.home.id, match.away.id].filter((id) => data.chat === true || id !== data.clubId).flatMap((id) =>
    ["raw", "archived"].map(async (kind) => {
      const snap = await db.collection(`clubs/${id}/video_highlights/${match.fixtureId}/${kind}`).limit(100).get();
      return snap.docs.map((doc) => {
        const clip = doc.data();
        const url = text(clip.videoUrl || clip.downloadUrl || clip.mediaUrl);
        if (!/^https:\/\//.test(url) || clip.deleted || clip.deletedAt || ["rejected", "deleted", "private"].includes(clip.status)) return null;
        return {id: doc.id, clipId: doc.id, matchId: match.fixtureId, videoUrl: url,
          title: text(clip.title).slice(0, 120), thumbnailUrl: text(clip.thumbnailUrl || clip.posterUrl),
          createdAt: typeof clip.createdAt === "string" ? clip.createdAt : match.proposedDate,
          status: clip.status === "approved" ? "approved" : "pending", source: "exhibition_shared",
          ...(data.chat === true ? {sourceClubId:id,bucket:kind} : {})};
      }).filter(Boolean);
    })));
  return {clips: [...new Map(buckets.flat().map((clip) => [data.chat === true ? `${clip.sourceClubId}:${clip.bucket}:${clip.clipId}` : clip.clipId, clip])).values()]};
}

async function bookExhibition({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (!/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose an exhibition match.");
  return db.runTransaction(async (tx) => {
    await getClub(tx, db, id);
    const ref = db.doc(`${COLLECTION}/${fixtureId}`);
    const match = (await tx.get(ref)).data();
    if (!match?.participatingClubIds?.includes(id)) throw forbidden("This match belongs to another Club.");
    const member = await verifiedMember(tx, db, id, user);
    if (!member) throw forbidden("Only active Club members can sign up.");
    const side = match.home.id === id ? "home" : "away";
    const bookings = match.bookings?.[side] || {};
    const own = Object.hasOwn(bookings, user.uid) ? bookings[user.uid] : Object.values(bookings).find((entry) => entry.memberId === member.memberId);
    if (own) return {fixtureId, priceCents: own.priceCents};
    if (match.status !== "accepted" || match.kickoffMs <= now || !Number.isSafeInteger(match.clubTotalCents)) {
      throw new ChallengeError("failed-precondition", "Signups are not open for this match.");
    }
    const count = Object.keys(bookings).length;
    if (count >= EXHIBITION_CAPACITY) throw new ChallengeError("failed-precondition", "All 15 places are taken.");
    const priceCents = exhibitionShareCents(match.clubTotalCents, count);
    // A displayed quote may shift by one cent when another player takes a spot.
    if (priceCents !== data.expectedPriceCents) throw new ChallengeError("failed-precondition", "The price has changed. Check the updated amount and try again.");
    tx.update(ref, {[`bookings.${side}`]: {...bookings, [user.uid]: {...member, priceCents}}, updatedAtMs: now});
    return {fixtureId, priceCents};
  });
}

async function manageExhibitionBookings({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (!/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose an exhibition.");
  return db.runTransaction(async (tx) => {
    await requireManager(tx, db, id, await getClub(tx, db, id), user);
    const ref = db.doc(`${COLLECTION}/${fixtureId}`);
    const match = (await tx.get(ref)).data();
    if (!match?.participatingClubIds?.includes(id)) throw forbidden("This fixture belongs to another Club.");
    if (match.status !== "accepted" || match.kickoffMs <= now || !Number.isSafeInteger(match.clubTotalCents)) {
      throw new ChallengeError("failed-precondition", "Signups are closed.");
    }
    const side = match.home.id === id ? "home" : "away";
    const bookings = {...match.bookings?.[side]};
    const player = (doc) => {
      const member = doc.data();
      const name = text(member?.shortName || member?.fullName || member?.displayName || member?.name);
      return member?.status === "active" && name ? {memberId: doc.id, name: name.slice(0, 60)} : null;
    };
    if (data.memberIds === undefined) {
      const roster = await tx.get(db.collection(`clubs/${id}/members`).where("status", "==", "active"));
      const signed = new Map(Object.values(bookings).map((entry) => [entry.memberId, entry]));
      return {players: roster.docs.map(player).filter(Boolean).map((member) => ({
        ...member, signed: signed.has(member.memberId), cashPaid: Boolean(signed.get(member.memberId)?.cashPaidAtMs),
      })).sort((a,b) => a.name.localeCompare(b.name))};
    }
    const ids = data.memberIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > EXHIBITION_CAPACITY || new Set(ids).size !== ids.length ||
      ids.some((memberId) => typeof memberId !== "string" || !ID_PATTERN.test(memberId))) throw invalid("Choose up to 15 Club players.");
    const members = await Promise.all(ids.map(async (memberId) => player(await tx.get(db.doc(`clubs/${id}/members/${memberId}`)))));
    if (members.some((member) => !member)) throw invalid("Only active players from this Club can be added.");
    const byMember = new Map(Object.entries(bookings).map(([key, entry]) => [entry.memberId, key]));
    let count = byMember.size;
    if (count + ids.filter((memberId) => !byMember.has(memberId)).length > EXHIBITION_CAPACITY) throw invalid("The selection exceeds the remaining places.");
    for (const member of members) {
      const key = byMember.get(member.memberId) || `member:${member.memberId}`;
      const saved = bookings[key];
      if (!saved) bookings[key] = {...member, priceCents: exhibitionShareCents(match.clubTotalCents, count++)};
      if (data.cashPaid === true && !bookings[key].cashPaidAtMs) {
        bookings[key] = {...bookings[key], cashPaidAtMs: now, cashRecordedBy: user.uid};
      }
    }
    tx.update(ref, {[`bookings.${side}`]: bookings, updatedAtMs: now});
    return {count};
  });
}

async function updateChallengeTeam({db, user, data, now = Date.now()}) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (!/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose a match.");
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTION}/${fixtureId}`);
    const match = (await tx.get(ref)).data();
    if (!match?.participatingClubIds?.includes(id)) throw forbidden("This match belongs to another Club.");
    const club = await getClub(tx, db, id);
    await requireManager(tx, db, id, club, user);
    if (match.status !== "accepted") throw new ChallengeError("failed-precondition", "The match must be accepted first.");
    const starters = Number(match.format.split("v")[0]);
    const side = match.home.id === id ? "home" : "away";
    let players;
    let memberIds;
    if (Number.isSafeInteger(match.clubTotalCents)) {
      memberIds = data?.memberIds;
      const signed = new Map(Object.values(match.bookings?.[side] || {}).map((entry) => [entry.memberId, entry.name]));
      if (!Array.isArray(memberIds) || memberIds.length > EXHIBITION_CAPACITY ||
          new Set(memberIds).size !== memberIds.length || memberIds.some((id) => !signed.has(id))) {
        throw invalid("Only signed-up players from your Club can be selected.");
      }
      players = memberIds.map((id) => signed.get(id));
    } else {
      const raw = data?.players;
      if (!Array.isArray(raw) || raw.length > 30) throw invalid("Enter a valid squad.");
      players = raw.map(text);
      if (players.some((player) => !player || player.length > 60) ||
          new Set(players.map((player) => player.toLowerCase())).size !== players.length) {
        throw invalid("Enter one unique player name per line, up to 60 characters each.");
      }
    }
    if (players.length < starters) throw invalid(`Select at least ${starters} players.`);
    const captainId = memberIds?.includes(data.captainId) ? data.captainId : "";
    const prior = match.teams?.[side]?.memberIds || [];
    const rosterChanged = memberIds && (prior.length !== memberIds.length || prior.some((id, index) => id !== memberIds[index]));
    tx.update(ref, {[`teams.${side}`]: {starters: players.slice(0, starters), substitutes: players.slice(starters),
      ...(memberIds ? {memberIds, captainId} : {})}, ...(rosterChanged ? {[`lineups.${side}`]: null} : {}), updatedAtMs: now});
    return {fixtureId};
  });
}

async function withFixture({db, user, data}, operation, allowMember = false) {
  requireVerifiedUser(user);
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (!/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose a match.");
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`${COLLECTION}/${fixtureId}`);
    const match = (await tx.get(ref)).data();
    if (!match?.participatingClubIds?.includes(id)) throw forbidden("This match belongs to another Club.");
    const club = await getClub(tx, db, id);
    let member = null;
    if (allowMember) {
      member = await verifiedMember(tx, db, id, user);
      if (!member) await requireManager(tx, db, id, club, user);
    } else await requireManager(tx, db, id, club, user);
    if (!["accepted", "live", "completed"].includes(match.status)) {
      throw new ChallengeError("failed-precondition", "Accept the challenge first.");
    }
    return operation({tx, ref, match, side: match.home.id === id ? "home" : "away", id, member});
  });
}

const CHAT_REACTIONS = new Set(["⚽","🔥","🧤","👏","😂","❤️","👍","👎","😩","🤯"]);
const chatId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value);

async function challengeChat({db, user, data, now = Date.now()}) {
  const body = text(data?.message);
  const action = data?.chatAction || (data?.message !== undefined || data?.attachment ? "send" : "read");
  if (!["read","send","react","delete"].includes(action)) throw invalid("Choose a chat action.");
  if (action === "send" && ((!body && !data.attachment) || body.length > 600)) throw invalid("Enter a message of up to 600 characters.");
  return withFixture({db, user, data}, async ({tx, side, match, member}) => {
    const messages = db.collection(`${COLLECTION}/${match.fixtureId}/chat`);
    if (action === "send") {
      let reply = null;
      if (data.replyToId) {
        if (!chatId(data.replyToId)) throw invalid("Choose a message from this chat.");
        const target = (await tx.get(messages.doc(data.replyToId))).data();
        if (!target || target.deleted) throw invalid("That message is no longer available.");
        reply = {id:data.replyToId, senderName:target.senderName, text:text(target.body).slice(0,160) || "Video highlight"};
      }
      let attachment = null;
      if (data.attachment) {
        const {sourceClubId,bucket,clipId} = data.attachment;
        if (!match.participatingClubIds.includes(sourceClubId) || !["raw","archived"].includes(bucket) || !chatId(clipId) ||
            !["live","completed"].includes(match.status)) throw invalid("Choose a video highlight from this exhibition.");
        const clip = (await tx.get(db.doc(`clubs/${sourceClubId}/video_highlights/${match.fixtureId}/${bucket}/${clipId}`))).data();
        const url = text(clip?.videoUrl || clip?.downloadUrl || clip?.mediaUrl);
        if (!/^https:\/\//.test(url) || clip.deleted || clip.deletedAt || ["rejected","deleted","private"].includes(clip.status)) {
          throw invalid("That video highlight is no longer available.");
        }
        attachment = {url, title:text(clip.title).slice(0,120) || "Match highlight"};
      }
      tx.create(messages.doc(), {body, clubId:match[side].id, clubName:match[side].name, senderUid:user.uid,
        senderName:member?.name || `${match[side].name} staff`, createdAtMs:now, ...(reply?{reply}:{}), ...(attachment?{attachment}:{})});
      return {sent:true};
    }
    if (action !== "read") {
      if (!chatId(data.messageId)) throw invalid("Choose a message from this chat.");
      const messageRef = messages.doc(data.messageId);
      const target = (await tx.get(messageRef)).data();
      if (!target || target.deleted) throw invalid("That message is no longer available.");
      if (action === "delete") {
        if (target.senderUid !== user.uid) throw forbidden("You can only delete your own messages.");
        tx.update(messageRef,{deleted:true,body:"",reply:null,attachment:null,reactions:{}});
      } else {
        const emoji = data.emoji;
        if (!CHAT_REACTIONS.has(emoji)) throw invalid("Choose a chat reaction.");
        const key = createHash("sha256").update(user.uid).digest("hex");
        const reactions = {...target.reactions};
        if (reactions[key] === emoji) delete reactions[key];
        else reactions[key] = emoji;
        tx.update(messageRef,{reactions});
      }
      return {updated:true};
    }
    const list = await tx.get(messages.orderBy("createdAtMs","desc").limit(40));
    const key = createHash("sha256").update(user.uid).digest("hex");
    return {messages:list.docs.map(doc => {
      const {senderUid,reactions,...message} = doc.data();
      const counts = {};
      for (const emoji of Object.values(reactions || {})) if (CHAT_REACTIONS.has(emoji)) counts[emoji]=(counts[emoji]||0)+1;
      return {...message,id:doc.id,mine:senderUid===user.uid,reactionCounts:counts,myReaction:reactions?.[key]||null};
    }).reverse()};
  }, true);
}

function remainingMs(live, now) {
  return live.endsAtMs ? Math.max(0, live.endsAtMs - now) : live.remainingMs;
}

function exhibitionLiveEvents(match) {
  if (Array.isArray(match.live?.events)) return match.live.events;
  const events = (match.live?.goals || []).map((goal, index) => ({
    id: `legacy-goal-${index}`, type: "goal", teamId: match[goal.side]?.id, scorer: goal.scorer || "",
    timeSeconds: goal.half === "second_half" ? match.live.halfMs / 1000 : 0,
  })).filter(event => event.teamId);
  for (const side of ["home", "away"]) {
    const count = events.filter(event => event.teamId === match[side].id).length;
    for (let n = count; n < (match.live?.[side] || 0); n++) {
      events.push({id: `legacy-${side}-${n}`, type: "goal", teamId: match[side].id, scorer: "", timeSeconds: 0});
    }
  }
  return events;
}

function exhibitionBoothView(match, user, canOperate, now) {
  const live = match.live;
  if (!live) return null;
  const profile = item => item ? {
    name: item.name || (item.clubId === match.home.id ? match.home.name : match.away.name),
    deviceId: canOperate && item.uid === user.uid ? item.device : null,
  } : null;
  const request = live.request;
  return {
    revision: live.revision, phase: live.phase, halfMs: live.halfMs,
    endsAtMs: live.endsAtMs, remainingMs: remainingMs(live, now),
    awaitingLineups: Boolean(live.awaitingLineups), halftimeEndsAtMs: live.halftimeEndsAtMs || null,
    controller: profile(live.controller),
    request: canOperate && request?.status ? {status: request.status, requester: profile(request),
      requestedAtISO: request.requestedAtISO, expiresAtISO: request.expiresAtISO} : null,
    events: exhibitionLiveEvents(match), confirmedLineups: live.confirmedLineups || null,
    addedTime: live.addedTime || {},
  };
}

function validateExhibitionLineups(match, snapshots, requireFull) {
  const size = Number(match.format.split("v")[0]);
  const keyOf = value => text(value).toLowerCase();
  if (!snapshots || Array.isArray(snapshots) || Object.keys(snapshots).length !== 2 ||
      JSON.stringify(snapshots).length > 80000) throw invalid("Confirm both exhibition lineups.");
  for (const side of ["home", "away"]) {
    const team = snapshots[match[side].id];
    const positions = Object.values(team?.positions || {}).filter(Boolean).map(keyOf);
    const eligible = new Set([...(match.teams[side].starters || []), ...(match.teams[side].substitutes || [])].map(keyOf));
    if (!team?.positions || positions.length > size || (requireFull && positions.length !== size) ||
        new Set(positions).size !== positions.length || positions.some(name => !eligible.has(name))) {
      throw invalid("Use the published squad and fill all starting positions before kickoff.");
    }
  }
}

async function watchExhibition({db,data,now=Date.now()}) {
  const id = clubId(data?.clubId);
  const fixtureId = text(data?.fixtureId);
  if (fixtureId && !/^[a-f0-9]{64}$/.test(fixtureId)) throw invalid("Choose an exhibition fixture.");
  return db.runTransaction(async tx => {
    const club = await getClub(tx,db,id);
    if (club.visibility?.listed === false || club.visibility?.public === false) return null;
    const candidates = fixtureId ? [await tx.get(db.doc(`${COLLECTION}/${fixtureId}`))]
      : (await tx.get(db.collection(COLLECTION).where("participatingClubIds","array-contains",id))).docs;
    const match = candidates.map(doc=>doc.data()).filter(row=>row?.participatingClubIds?.includes(id) &&
      (row.status === "live" || (fixtureId && row.status === "completed")))
      .sort((a,b)=>b.kickoffMs-a.kickoffMs)[0];
    if (!match) return null;
    const opponent = await getClub(tx,db,match.home.id===id?match.away.id:match.home.id);
    if (opponent.visibility?.listed === false || opponent.visibility?.public === false) return null;
    const live = exhibitionBoothView(match,{},false,now);
    return {fixtureId:match.fixtureId,status:match.status,format:match.format,home:match.home,away:match.away,
      serverNowMs:now, live:{phase:live.phase,halfMs:live.halfMs,endsAtMs:live.endsAtMs,remainingMs:live.remainingMs,
        halftimeEndsAtMs:live.halftimeEndsAtMs,awaitingLineups:live.awaitingLineups,
        events:live.events.map(({id,type,teamId,timeSeconds})=>({id,type,teamId,timeSeconds}))}};
  });
}

async function operateChallenge({db, user, data, now = Date.now()}) {
  const command = data?.command;
  const device = text(data?.device);
  if (!/^[a-f0-9-]{36}$/.test(device)) throw invalid("Use a valid match device.");
  return withFixture({db, user, data}, async ({tx, ref, match, id, side}) => {
    const controller = {uid: user.uid, device, clubId: id, name: text(user.name).slice(0,100) || match[side].name};
    if (command === "start") {
      const minutes = match.format === "11v11" ? 90 : data.minutes;
      if (match.cancellation?.outcome === "pending") throw invalid("Resolve the cancellation request before starting.");
      if (match.status !== "accepted" || !match.teams?.home || !match.teams?.away) {
        throw new ChallengeError("failed-precondition", "Both captains must publish their squads before kickoff.");
      }
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw invalid("Choose between 1 and 120 minutes.");
      const startingLineups = Object.fromEntries(["home", "away"].map((teamSide) => {
        const lineup = match.lineups?.[teamSide];
        const published = lineup ? Object.values(lineup.positions).filter(Boolean) : [];
        return [teamSide, published.length === Number(match.format.split("v")[0]) ? published : match.teams[teamSide].starters];
      }));
      tx.update(ref, {
        status: "live", updatedAtMs: now, startingLineups,
        ...(match.postponement?.status === "pending" ? {postponement:{...match.postponement,status:"expired"}} : {}),
        live: {controller, revision: 1, phase: "first_half", halfMs: minutes * 30000,
          remainingMs: minutes * 30000, endsAtMs: data.verifyFirst ? null : now + minutes * 30000,
          awaitingLineups: Boolean(data.verifyFirst), home: 0, away: 0},
      });
      return {status: "live"};
    }
    const live = match.live;
    if (match.status !== "live" || !live || data.revision !== live.revision) {
      throw new ChallengeError("failed-precondition", "The match changed. Refresh and try again.");
    }
    const controls = live.controller.uid === user.uid && live.controller.device === device;
    const patch = {...live, revision: live.revision + 1};
    let status = "live";
    if (command === "requestControl" && !controls) {
      if (live.request?.status === "pending" && live.request.device === device && live.request.uid === user.uid) return {status, side};
      if (live.request?.status === "pending" && Date.parse(live.request.expiresAtISO) + 60000 > now) {
        throw invalid("Another referee is already requesting control.");
      }
      patch.request = {...controller, email: user.email, status: "pending", ...takeoverWindow(now)};
    } else if (command === "takeover" && !controls) {
      if (live.request?.uid !== user.uid || live.request?.device !== device || !takeoverReady(live.request, now)) {
        throw forbidden("The takeover request is not ready.");
      }
      patch.controller = controller;
      delete patch.request;
    } else {
      if (!controls) throw forbidden("Only the phone controlling the match can do that.");
      switch (command) {
        case "transferControl":
          if (!live.request || live.request.status === "rejected") throw invalid("No phone has requested control.");
          const targetClub = await getClub(tx, db, live.request.clubId);
          await requireManager(tx, db, live.request.clubId, targetClub, {
            uid: live.request.uid, email: live.request.email || "",
          });
          patch.controller = {uid:live.request.uid, device:live.request.device, clubId:live.request.clubId, name:live.request.name || "Referee"};
          delete patch.request;
          break;
        case "rejectControl":
          if (!live.request || live.request.status !== "pending") throw invalid("No phone has requested control.");
          patch.request = {...live.request, status:"rejected"};
          break;
        case "confirmLineups":
          validateExhibitionLineups(match, data.snapshots, live.awaitingLineups);
          patch.confirmedLineups = data.snapshots;
          if (live.awaitingLineups) {
            patch.awaitingLineups = false;
            patch.endsAtMs = now + live.halfMs;
          }
          break;
        case "addTime": {
          const extra = Number(data.seconds);
          if (live.awaitingLineups || live.phase === "halftime" || live.addedTime?.[live.phase] ||
              remainingMs(live, now) > 120000 || !Number.isInteger(extra) || extra < 1 || extra > 900) {
            throw invalid("Added time is available once per half, in the final two minutes.");
          }
          patch.addedTime = {...live.addedTime, [live.phase]:extra};
          patch.remainingMs = remainingMs(live, now) + extra * 1000;
          patch.endsAtMs = now + patch.remainingMs;
          break;
        }
        case "editEvent": {
          const events = exhibitionLiveEvents(match);
          const index = events.findIndex(event => event.id === data.eventId);
          if (live.awaitingLineups || (live.phase === "halftime" && data.mode === "append") || (data.mode !== "append" && index < 0)) throw invalid("This event cannot be changed.");
          let next;
          if (data.mode === "delete") next = events.filter((_, i) => i !== index);
          else {
            const event = data.event;
            const eventSide = ["home","away"].find(key => match[key].id === event?.teamId);
            const roster = match.teams[eventSide];
            const names = new Set([...(roster?.starters || []), ...(roster?.substitutes || [])].map(n => text(n).toLowerCase()));
            if (!eventSide || !["goal","yellow_card","red_card","injury","injury_knock","injury_sitting_out","injury_recovered","foul"].includes(event?.type) ||
                !text(event.id) || !Number.isFinite(event.timeSeconds) || event.timeSeconds < 0 ||
                JSON.stringify(event).length > 6000 ||
                [event.scorer,event.assist,event.playerName].some(name => name && !names.has(text(name).toLowerCase()))) {
              throw invalid("Choose a valid match event and a player from the published squad.");
            }
            if (data.mode === "append") next = events.some(row => row.id === event.id) ? events : [...events,event];
            else if (data.mode === "replace") next = events.map((row,i) => i === index ? {...event,id:row.id} : row);
            else throw invalid("Choose a valid event action.");
          }
          try {checkedPatch({currentEvents:next});} catch (error) {throw invalid(error.message);}
          patch.events = next;
          for (const key of ["home","away"]) patch[key] = next.filter(e => e.type === "goal" && e.teamId === match[key].id).length;
          patch.goals = next.filter(e => e.type === "goal").map(e => ({side:e.teamId === match.home.id ? "home" : "away",
            scorer:e.scorer || "", half:e.timeSeconds >= live.halfMs/1000 ? "second_half" : "first_half", createdAtMs:now}));
          break;
        }
        case "cancelStart":
          tx.update(ref, {status:"accepted", live:null, startingLineups:null, updatedAtMs:now});
          return {status:"accepted", side};
        case "halftime":
          if (live.phase !== "first_half" || remainingMs(live, now) > 0) throw invalid("The first half has not ended.");
          patch.phase = "halftime";
          patch.remainingMs = 0;
          patch.endsAtMs = null;
          patch.halftimeEndsAtMs = now + 15 * 60000;
          break;
        case "secondHalf":
          if (live.phase !== "halftime") throw invalid("The match is not at halftime.");
          patch.phase = "second_half";
          patch.remainingMs = live.halfMs;
          patch.endsAtMs = now + live.halfMs;
          break;
        case "pause":
          patch.remainingMs = remainingMs(live, now);
          patch.endsAtMs = null;
          break;
        case "resume":
          if (live.endsAtMs || live.remainingMs <= 0) throw invalid("The clock cannot be resumed.");
          patch.endsAtMs = now + live.remainingMs;
          break;
        case "score":
          if (!["home", "away"].includes(data.side) || ![-1, 1].includes(data.change)) throw invalid("Invalid score change.");
          if (live.awaitingLineups || live.phase === "halftime" || live.events) throw invalid("Use the referee booth to record goals.");
          patch[data.side] = Math.max(0, Math.min(99, patch[data.side] + data.change));
          patch.goals = [...(live.goals || [])];
          if (data.change === 1 && patch[data.side] > live[data.side]) {
            const scorer = text(data.scorer);
            const roster = match.teams?.[data.side];
            if (scorer && ![...(roster?.starters || []), ...(roster?.substitutes || [])].includes(scorer)) throw invalid("Choose a player from this squad.");
            patch.goals.push({side: data.side, scorer, half: live.phase || "first_half", createdAtMs: now});
          } else if (data.change === -1) {
            const last = patch.goals.findLastIndex((event) => event.side === data.side);
            if (last >= 0) patch.goals.splice(last, 1);
          }
          break;
        case "finish":
          status = "completed";
          patch.phase = "full_time";
          patch.remainingMs = remainingMs(live, now);
          patch.endsAtMs = null;
          delete patch.request;
          break;
        default:
          throw invalid("Choose a match control.");
      }
    }
    tx.update(ref, {live: patch, status, updatedAtMs: now, ...(status === "completed" ? {completedAtMs: now} : {})});
    return {status, side, revision:patch.revision};
  });
}

const instigateClubChallenge = (args) => sendClubChallenge(args, true);

module.exports = {COLLECTION, ChallengeError, sendClubChallenge, instigateClubChallenge, respondToClubChallenge,
  listClubChallenges, updateChallengeTeam, challengeChat, operateChallenge, exhibitionOverview, bookExhibition, exhibitionShareCents, reviseClubChallenge, manageExhibitionBookings, getExhibitionMatchday, saveExhibitionLineup, listExhibitionClips, changeExhibitionKit, expireExhibitionCancellations, watchExhibition};
