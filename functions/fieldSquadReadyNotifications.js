const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {FieldValue} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {createHash, randomUUID} = require("node:crypto");
const service = require("./fieldSeasonSquadService");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const address = value => String(value || "").trim().toLowerCase();

function buildHandlers({db, region, sendBatch}) {
  const auth = getAuth();
  async function resolve(member) {
    try {
      if (member.uid) return (await auth.getUser(member.uid)).uid;
      if (!member.email) return null;
      const account = await auth.getUserByEmail(address(member.email));
      return account.emailVerified ? account.uid : null;
    } catch (error) {
      if (error.code === "auth/user-not-found") return null;
      throw error;
    }
  }
  async function deliver({venueId, seasonId, clubId, matchDayId = "",
    uid, memberId = "", kind, revision}) {
    const key = hash({venueId, seasonId, clubId, matchDayId, uid, kind, revision});
    const ref = db.doc(`fieldSquadNotificationDeliveries/${key}`);
    const claim = randomUUID();
    const acquired = await db.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data();
      if (previous?.status === "sent" || previous?.leaseUntilMs > Date.now()) return false;
      tx.set(ref, {
        status: "sending", claim, leaseUntilMs: Date.now() + 300000,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return true;
    });
    if (!acquired) return;
    try {
      const devices = await db.collectionGroup("notificationDevices")
        .where("firebaseUid", "==", uid).get();
      const seen = new Set();
      const tokenRecords = [];
      for (const device of devices.docs) {
        const item = device.data();
        if (item.enabled !== true || item.firebaseUid !== uid ||
            !item.token || seen.has(item.token)) continue;
        seen.add(item.token);
        tokenRecords.push({token: item.token, ref: device.ref});
      }
      if (!tokenRecords.length) {
        await ref.update({status: "no_devices", leaseUntilMs: 0});
        return;
      }
      const result = await sendBatch({
        tokenRecords,
        title: kind === "reminder" ? "Confirm tomorrow’s six" : "League fixtures released",
        body: kind === "reminder"
          ? "Review availability, arrange any fill-ins and send your six-player squad to the Field."
          : "Your league dates are ready. Open the matrix and mark any days you cannot play.",
        imageUrl: "",
        data: {
          type: kind === "reminder" ? "field_squad_ready_reminder" : "field_squad_fixtures_released",
          route: "club-league", venueId, seasonId, clubId, matchDayId, memberId,
        },
      });
      if (!result.successCount) throw new Error("No squad reminders were delivered.");
      await ref.update({
        status: "sent", leaseUntilMs: 0,
        sentAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (current.data()?.claim === claim) tx.update(ref, {
          status: "failed", leaseUntilMs: 0,
          error: String(error.message).slice(0, 250),
        });
      });
      throw error;
    }
  }

  async function clubRecipients(venueId, season, clubId, kind) {
    const [clubSnap, membershipSnap, squadSnap] = await Promise.all([
      db.doc(`clubs/${clubId}`).get(),
      db.doc(`clubFieldMemberships/${clubId}`).get(),
      db.doc(`leagueSeasonSquads/${venueId}~${season.id}~${clubId}`).get(),
    ]);
    const club = clubSnap.data();
    if (!club || club.deleted || club.status === "deleted" ||
        membershipSnap.data()?.status !== "active" ||
        membershipSnap.data()?.venueId !== venueId) return [];
    const recipients = new Map();
    const ids = [club.ownerUid, club.createdByUid, ...(club.adminUids || [])].filter(Boolean);
    const emails = [...(club.adminEmails || []), ...(club.captainEmails || []),
      club.captainEmail, club.captain?.email].filter(Boolean);
    for (const uid of ids) {
      const resolved = await resolve({uid});
      if (resolved) recipients.set(resolved, "");
    }
    for (const email of emails) {
      const uid = await resolve({email});
      if (uid) recipients.set(uid, "");
    }
    if (kind !== "reminder") {
      for (const entry of Object.values(squadSnap.data()?.entries || {})) {
        if (entry.invitationStatus !== "accepted") continue;
        const member = (await db.doc(
          `clubs/${clubId}/members/${entry.memberId}`
        ).get()).data();
        if (!member || (member.status || "active") !== "active" ||
            member.playerId !== entry.sourcePlayerId) continue;
        const uid = await resolve(member);
        if (uid) recipients.set(uid, entry.memberId);
      }
    }
    return [...recipients].map(([uid, memberId]) => ({uid, memberId}));
  }

  async function notify(venueId, season, kind, matchDayId = "", revision = "") {
    for (const clubId of season.clubIds || []) {
      if (matchDayId && !(season.fixtures || []).some(fixture =>
        fixture.matchDayId === matchDayId && fixture.status === "scheduled" &&
        [fixture.clubAId, fixture.clubBId].includes(clubId))) continue;
      const recipients = await clubRecipients(venueId, season, clubId, kind);
      for (const recipient of recipients) {
        await deliver({
          venueId, seasonId: season.id, clubId, matchDayId,
          kind, revision, ...recipient,
        });
      }
    }
  }
  return {
    fieldSquadFixturesPublished: onDocumentUpdated({
      document: "leagueVenues/{venueId}", region, retry: true,
    }, async event => {
      const before = event.data.before.data()?.league?.activeSeason;
      const after = event.data.after.data()?.league?.activeSeason;
      if (!after || after.status !== "active" || !after.schedulePublishedAtMs ||
          after.gameFormat !== "5_V_5") return;
      const schedule = season => ({
        seasonId: season?.id, published: season?.schedulePublishedAtMs || 0,
        fixtures: (season?.fixtures || []).map(fixture => ({
          id: fixture.id, day: fixture.matchDayId,
          clubAId: fixture.clubAId, clubBId: fixture.clubBId,
          scheduledLocal: fixture.scheduledLocal,
        })),
      });
      const revision = hash(schedule(after));
      if (revision === hash(schedule(before))) return;
      await notify(event.params.venueId, after, "fixtures", "", revision);
    }),
    remindFieldSquadCaptains: onSchedule({
      schedule: "0 8-20 * * *", timeZone: "Africa/Johannesburg", region,
    }, async () => {
      const tomorrow = new Date(Date.now() + 86400000);
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Johannesburg", year: "numeric",
        month: "2-digit", day: "2-digit",
      }).format(tomorrow);
      let cursor = null;
      while (true) {
        let query = db.collection("leagueVenues").orderBy("__name__").limit(100);
        if (cursor) query = query.startAfter(cursor);
        const venues = await query.get();
        for (const venue of venues.docs) {
          const season = venue.data()?.league?.activeSeason;
          if (season?.status !== "active" || season.gameFormat !== "5_V_5" ||
              !season.schedulePublishedAtMs) continue;
          for (const day of season.matchDays || []) {
            if (day.dateLocal === date && day.status === "scheduled") {
              await notify(venue.id, season, "reminder", day.id, date);
            }
          }
        }
        if (venues.size < 100) break;
        cursor = venues.docs[venues.docs.length - 1];
      }
    }),
  };
}
exports.buildHandlers = buildHandlers;
