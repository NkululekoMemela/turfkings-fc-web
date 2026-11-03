const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {FieldValue} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {createHash, randomUUID} = require("node:crypto");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const address = value => String(value || "").trim().toLowerCase();

function buildHandlers({db, region, sendBatch, auth: suppliedAuth}) {
  const auth = suppliedAuth || getAuth();
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
    uid, memberId = "", kind, revision, squadNames = "", needsAttention = false}) {
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
        title: kind === "admin_summary" ? "Match-day squads & colours" : kind === "reminder" ? "Check your next match" : "League fixtures released",
        body: kind === "admin_summary" ? squadNames : kind === "reminder"
          ? needsAttention ? "Your next squad needs attention. Review missing players or eligibility." : `${squadNames ? squadNames + ". " : "Your squad carries forward. "}Confirm or change players. No action keeps this squad.`
          : "Fixtures are ready. View your opponents and kickoff times. Your eligible season squad carries into every match.",
        imageUrl: "",
        data: {
          type: kind === "admin_summary" ? "field_match_day_squads" : kind === "reminder" ? "field_squad_ready_reminder" : "field_squad_fixtures_released",
          route: kind === "admin_summary" ? "field" : "club-league", venueId, seasonId, clubId, matchDayId, memberId,
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
    const captains=await db.collection(`clubs/${clubId}/members`).get();
    for(const doc of captains.docs){const member=doc.data();if(member.status!=="active"||!["captain","admin"].includes(member.role))continue;const uid=await resolve(member);if(uid)recipients.set(uid,doc.id);}
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
      let squadNames="",needsAttention=false;
      if(kind==="reminder"&&matchDayId){
        try{const roster=await db.runTransaction(tx=>require("./fieldMatchDaySquad").loadDay({db,tx,scope:{venueId,seasonId:season.id,clubId},matchDayId}));needsAttention=roster.submission.ready===false;squadNames=(await import("./fieldKitNotice.mjs")).squadKitSummary(roster.submission.players);}catch(error){console.warn("[Field squad review]",clubId,error.message);}
      }
      const recipients = await clubRecipients(venueId, season, clubId, kind);
      for (const recipient of recipients) {
        await deliver({
          venueId, seasonId: season.id, clubId, matchDayId,
          kind, revision, squadNames, needsAttention, ...recipient,
        });
      }
    }
  }
  async function notifyAdmin(venueId,venue,season,day){
    const rows=await Promise.all((season.clubIds||[]).map(async clubId=>{
      if(!(season.fixtures||[]).some(f=>f.matchDayId===day.id&&[f.clubAId,f.clubBId].includes(clubId)))return "";
      try{const roster=await db.runTransaction(tx=>require("./fieldMatchDaySquad").loadDay({db,tx,scope:{venueId,seasonId:season.id,clubId},matchDayId:day.id}));return `${roster.club?.name||clubId}: ${(await import("./fieldKitNotice.mjs")).squadKitSummary(roster.submission.players)}`;}catch{return `${clubId}: squad needs attention`;}
    }));
    const recipients=new Set([venue.ownerUid].filter(Boolean));
    const staff=await db.collection(`leagueVenues/${venueId}/staff`).get();
    for(const member of staff.docs){const d=member.data();if(d.status==="active"&&d.isAdministrator===true){const uid=await resolve({...d,uid:d.uid||member.id});if(uid)recipients.add(uid);}}
    for(const uid of recipients)await deliver({venueId,seasonId:season.id,clubId:"",matchDayId:day.id,uid,kind:"admin_summary",revision:`${day.id}:16h`,squadNames:rows.filter(Boolean).join(" · ").slice(0,2800)});
  }
  return {
    fieldSquadRosterChanged: onDocumentUpdated({document:"leagueSeasonSquads/{squadId}",region,retry:true},async event=>{
      const squad=event.data.after.data();if(!squad||squad.status!=="active")return;
      const venue=(await db.doc(`leagueVenues/${squad.venueId}`).get()).data(),season=venue?.league?.activeSeason;
      if(season?.id!==squad.seasonId||season.status!=="active")return;
      const revision=hash({entries:squad.entries,availability:squad.matchDayAvailability,replacements:squad.matchDayReplacements,submissions:squad.matchDaySubmissions});
      const old=event.data.before.data()||{};
      if(revision===hash({entries:old.entries,availability:old.matchDayAvailability,replacements:old.matchDayReplacements,submissions:old.matchDaySubmissions}))return;
      await Promise.all((season.matchDays||[]).filter(day=>day.status==="scheduled"&&(season.fixtures||[]).some(f=>f.matchDayId===day.id&&f.status==="scheduled"&&[f.clubAId,f.clubBId].includes(squad.clubId))).map(day=>db.doc(`leagueVenues/${squad.venueId}/seasons/${season.id}/fieldMatchDayManifests/${day.id}/clubs/${squad.clubId}`).set({clubId:squad.clubId,sourceRevision:revision,updatedAt:FieldValue.serverTimestamp()},{merge:true})));
    }),
    fieldSquadNextFixtureReview: onDocumentUpdated({document:"leagueVenues/{venueId}",region,retry:true},async event=>{
      const before=event.data.before.data()?.league?.activeSeason,season=event.data.after.data()?.league?.activeSeason;
      if(!season||season.status!=="active"||!season.schedulePublishedAtMs||season.gameFormat!=="5_V_5")return;
      const signature=s=>hash({id:s?.id,published:s?.schedulePublishedAtMs,results:(s?.results||[]).map(r=>r.fixtureId),history:(s?.matchDayHistory||[]).map(d=>d.id)});
      if(signature(before)===signature(season))return;
      const day=(season.matchDays||[]).filter(d=>d.status==="scheduled"&&(season.fixtures||[]).some(f=>f.matchDayId===d.id&&f.status==="scheduled"&&!season.liveMatches?.[f.id])).sort((a,b)=>a.dateLocal.localeCompare(b.dateLocal))[0];
      if(day)await notify(event.params.venueId,season,"reminder",day.id,day.id);
    }),
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
      schedule: "*/15 * * * *", timeZone: "Africa/Johannesburg", region,
    }, async () => {
      let cursor = null;
      // Pagination stops when the final bounded page is reached.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let query = db.collection("leagueVenues").orderBy("__name__").limit(100);
        if (cursor) query = query.startAfter(cursor);
        const venues = await query.get();
        for (const venue of venues.docs) {
          const season = venue.data()?.league?.activeSeason;
          if (season?.status !== "active" || season.gameFormat !== "5_V_5" ||
              !season.schedulePublishedAtMs) continue;
          for (const day of season.matchDays || []) {
            if(day.status!=="scheduled")continue;
            const phase=(await import("./fieldKitNotice.mjs")).noticePhase(day,season.fixtures||[]);
            if(phase==="captain")await notify(venue.id,season,"reminder",day.id,`${day.id}:24h`);
            if(phase==="admin")await notifyAdmin(venue.id,venue.data(),season,day);
          }
        }
        if (venues.size < 100) break;
        cursor = venues.docs[venues.docs.length - 1];
      }
    }),
  };
}
exports.buildHandlers = buildHandlers;
