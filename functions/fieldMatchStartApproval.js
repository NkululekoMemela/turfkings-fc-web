const {onRequest} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {getFirestore, Timestamp, FieldValue, FieldPath} = require("firebase-admin/firestore");
const {clubsAlreadyPlaying} = require("./fieldMatchDocuments.cjs");
const {randomUUID} = require("node:crypto");

exports.approvalHandler = async (req, res, dependencies = {}) => {
    if (req.method !== "POST") {
      return res.status(405).json({error: "Use POST."});
    }
    try {
      const bearer = String(req.headers.authorization || "")
        .match(/^Bearer (.+)$/);
      if (!bearer) return res.status(401).json({error: "Sign in first."});
      const verifyToken = dependencies.verifyToken ||
        ((token, revoked) => admin.auth().verifyIdToken(token, revoked));
      const user = await verifyToken(bearer[1], true);
      if (user.cameraSession || user.practiceSession || user.firebase?.sign_in_provider === "anonymous") {
        throw new Error("Use your signed-in Field staff account for Official play.");
      }
      const {venueId, seasonId, fixtureId} = req.body || {};
      if ([venueId, seasonId, fixtureId].some(value =>
        typeof value !== "string" ||
        !/^[A-Za-z0-9_-]{1,150}$/.test(value))) {
        return res.status(400).json({error: "Invalid match reference."});
      }

      const db = dependencies.db || getFirestore();
      const venueRef = db.doc(`leagueVenues/${venueId}`);
      const approvalId = randomUUID();
      const approvalRef = venueRef.collection("seasons").doc(seasonId)
        .collection("startApprovals").doc(approvalId);

      let startedMatch = null;
      await db.runTransaction(async transaction => {
        const venueSnap = await transaction.get(venueRef);
        const staffSnap = await transaction.get(
          venueRef.collection("staff").doc(user.uid)
        );
        if (!venueSnap.exists) throw new Error("Field no longer exists.");
        const venue = venueSnap.data();
        if (venue.deleted || venue.status === "deleted") throw new Error("This Field is archived.");
        const staff = staffSnap.data();
        if (venue.ownerUid !== user.uid &&
            !(staff?.status === "active" &&
              (["field_manager", "assistant_manager", "field_assistant", "other_staff", "referee"].includes(staff.role)))) {
          throw new Error("Only an approved Field official can start a match.");
        }

        const season = venue.league?.activeSeason;
        const fixture = (season?.fixtures || [])
          .find(item => item.id === fixtureId);
        const day = (season?.matchDays || [])
          .find(item => item.id === fixture?.matchDayId);
        if (season?.id !== seasonId || season.status !== "active" || !fixture ||
            season.scheduleVersion !== 1) {
          throw new Error("This fixture is unavailable in the current Field season.");
        }
        let savedMatchRef = venueRef.collection("seasons").doc(seasonId).collection("matches").doc(fixtureId);
        let savedMatchSnapshot = await transaction.get(savedMatchRef);
        if (!savedMatchSnapshot.exists) {
          const legacyRef = venueRef.collection("seasons").doc(seasonId).collection("matches").doc("current");
          const legacySnapshot = await transaction.get(legacyRef);
          if (legacySnapshot.data()?.fixtureId === fixtureId) {
            savedMatchRef = legacyRef;
            savedMatchSnapshot = legacySnapshot;
          }
        }
        const savedMatch = savedMatchSnapshot.data();
        if (savedMatch?.venueId && savedMatch.venueId !== venueId) {
          throw new Error("This saved match belongs to another Field. Its record has been kept.");
        }
        const savedApprovalId = savedMatch?.startApprovalId;
        const savedApproval = typeof savedApprovalId === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(savedApprovalId)
          ? (await transaction.get(venueRef.collection("seasons").doc(seasonId)
            .collection("startApprovals").doc(savedApprovalId))).data() : null;
        // Reversals used to remove only matches/current, leaving a completed
        // per-fixture document behind. Recover only with the manager's audit.
        let reversal = null;
        if (fixture.status === "scheduled" && savedMatch &&
            (savedMatch.status === "completed" || savedMatch.isFinished || savedMatch.finalSummary)) {
          const audits = await transaction.get(venueRef.collection("matchReversals").where("fixtureId", "==", fixtureId));
          reversal = audits.docs.map(item => ({...item.data(),venueId}))
            .filter(item => item.seasonId === seasonId)
            .sort((a,b) => Number(b.at?.toMillis?.() || 0) - Number(a.at?.toMillis?.() || 0))[0] || null;
        }
        const {fieldFixtureStartRecovery, recoveredFieldMatchSummary} = await import("./fieldFixtureStartRecovery.mjs");
        const recovery = req.body?.startRequested === true
          ? fieldFixtureStartRecovery({venueId, season, fixture, match: savedMatch, approval: savedApproval,
            indexedMatch:season.liveMatches?.[fixtureId],liveDocumentId:savedMatchRef.id,reversal}) : {kind:"new"};
        if (recovery.kind === "resume") {
          const otherLive = Object.values(season.liveMatches || {}).find(item => item.status === "live" &&
            item.fixtureId !== fixtureId && [item.clubAId,item.clubBId].some(id => [fixture.clubAId,fixture.clubBId].includes(id)));
          if (otherLive) throw new Error("One of these Clubs is already playing a different fixture. Review Live Matches first.");
          const summary = recoveredFieldMatchSummary({season,fixture,match:savedMatch,approval:savedApproval,liveDocumentId:savedMatchRef.id});
          transaction.update(venueRef, new FieldPath("league","activeSeason","liveMatches",fixtureId),summary,
            "updatedAt",FieldValue.serverTimestamp());
          startedMatch={...summary,startedAt:null};
          return;
        }
        const replacing = ["replace-unstarted", "replace-reversed"].includes(recovery.kind);
        const unstartedSummary = replacing ? season.liveMatches?.[fixtureId] : null;
        const startSeason = unstartedSummary ? {...season, liveMatches:Object.fromEntries(
          Object.entries(season.liveMatches||{}).filter(([id])=>id!==fixtureId))} : season;
        if (
            fixture?.status !== "scheduled" ||
            day?.status !== "scheduled" ||
            !day.fixtureIds?.includes(fixtureId) ||
            (season.liveMatches?.[fixtureId] && !unstartedSummary)) {
          throw new Error("This fixture is unavailable.");
        }
        if (clubsAlreadyPlaying(startSeason, fixture)) {
          throw new Error("A club in this fixture is already playing.");
        }
        const {canStartBesideLiveFixtures} = await import("./fieldParallelKickoffs.mjs");
        if (!canStartBesideLiveFixtures(startSeason, fixture)) {
          throw new Error("Finish the live match first, unless these fixtures share an approved parallel kickoff.");
        }
        const {assertFieldMatchDayProgression} =
          await import("./fieldMatchDayProgression.mjs");
        assertFieldMatchDayProgression({season, matchDayId: day.id});
        const earlyStartConfirmed = req.body?.earlyStartConfirmed === true;
        const earlyStartReason=String(req.body?.earlyStartReason||'').trim().slice(0,300);
        if(earlyStartConfirmed&&earlyStartReason.length<5)throw new Error('Give a short reason for starting outside the schedule.');
        const {assertFieldStartTiming} = await import("./fieldStartTiming.mjs");
        assertFieldStartTiming({season, fixture, confirmed: earlyStartConfirmed});
        const minimum = {
          "5_V_5": 5, "6_V_6": 6, "7_V_7": 7, "11_V_11": 11,
        }[season.gameFormat];
        if (!minimum) throw new Error("Unsupported game format.");

        for (const clubId of [fixture.clubAId, fixture.clubBId]) {
          if (season.invitations?.[clubId]?.status !== "accepted") {
            throw new Error("Both Clubs must accept the league invitation before playing.");
          }
        }

        const commitStart = req.body?.startRequested === true;
        const deviceId = String(req.body?.deviceId || "");
        const requestId = String(req.body?.requestId || "");
        if (commitStart && (!/^[A-Za-z0-9_-]{8,160}$/.test(deviceId) ||
            !/^[A-Za-z0-9_-]{8,160}$/.test(requestId))) {
          throw new Error("The referee device or start request is missing. Reopen the fixture.");
        }
        const {loadFieldMatchRoster} = require("./fieldMatchRoster.js");
        const {squads, bookingVersions, squadVersions, squadFingerprints} =
          await loadFieldMatchRoster({
            transaction, db, venueId, season:startSeason, fixture,
            supersededUnstartedFixtureId:replacing ? fixtureId : "",
          });
        const {startingLineups, sourceFormations} =
          await require("./fieldStartingFormation").build({
            season, fixture, squads, squadFingerprints,
          });
        const stockConfig=(await transaction.get(venueRef.collection("bibHireConfig").doc("stock"))).data()||{};
        if (commitStart && ((season.clubIds||[]).length < Math.max(3,Number(season.minimumClubs)||3) ||
            (season.clubIds||[]).length > 100)) {
          throw new Error("Register the required number of Clubs before starting this league fixture.");
        }
        const serverClubs = commitStart ? await Promise.all((season.clubIds || []).map(id =>
          transaction.get(db.doc(`clubs/${id}`)))) : [];
        if (commitStart) {
          const {buildFieldInitialMatch} = await import("./fieldInitialMatch.mjs");
          const match = prepareApprovedFieldStart({season:startSeason, fixture, user, staff, serverClubs, deviceId, requestId});
          const {data} = buildFieldInitialMatch({scope:{venueId,seasonId}, match, teams:match.teams,
            controller:match.controller, matchSeconds:Number(season.matchSeconds)||2400,
            currentMatchNo:match.matchNo, startedByUid:user.uid, timestamp:()=>FieldValue.serverTimestamp()});
          const live = {...data, startApprovalId:approvalId, startRequestId:requestId, paidSquads:squads,
            confirmedLineupSnapshot:startingLineups, running:false, awaitingKitVerification:true,
            clockVersion:1, clockPhase:"first_half",
            halftimeSeconds:Number(season.scheduleSettings?.halftimeMinutes??5)*60, halftimeEndsAtMs:0,
            fixtureIndex:season.fixtures.findIndex(item=>item.id===fixtureId),
            matchDayIndex:season.matchDays.findIndex(item=>item.id===day.id)};
          const {teams:ignoredTeams,controller:ignoredController,...summary} = match;
          transaction.update(venueRef, new FieldPath("league","activeSeason","liveMatches",fixtureId), summary,
            "updatedAt",FieldValue.serverTimestamp());
          if (savedMatchSnapshot.exists) {
            transaction.create(savedMatchRef.collection("startRecoveryHistory").doc(requestId), {
              previousMatch:savedMatch,recoveredByUid:user.uid,recoveredAt:FieldValue.serverTimestamp(),
              reason:recovery.kind === "replace-reversed" ? "Replay after manager result reversal; prior completed match retained." : "Fresh kickoff of an unstarted lineup check; prior document retained.",
            });
            // Replace only a validated draft or explicitly reversed result; retain its snapshot.
            transaction.set(savedMatchRef,live);
            if (savedMatchRef.id !== fixtureId) {
              summary.liveDocumentId = savedMatchRef.id;
              transaction.update(venueRef,new FieldPath("league","activeSeason","liveMatches",fixtureId),summary);
            }
          } else {
            transaction.create(savedMatchRef,live);
          }
          transaction.create(venueRef.collection("actionLog").doc(requestId),{
            venueId,seasonId,fixtureId,action:"match_started",label:"Match started",
            details:`${fixture.clubAName||fixture.clubAId} vs ${fixture.clubBName||fixture.clubBId}${earlyStartConfirmed ? "; OUTSIDE SCHEDULE: "+earlyStartReason : ""}`.slice(0,500),
            actorUid:user.uid,actorEmail:user.email||"",actorName:String(user.name||user.email||user.uid).slice(0,100),
            at:FieldValue.serverTimestamp(),
          });
          startedMatch={...summary,startedAt:null};
        }
        transaction.set(approvalRef, {
          venueId, seasonId, fixtureId, matchDayId: day.id,
          actorUid: user.uid, gameFormat: season.gameFormat, stockRevision:stockConfig.revision||0,
          earlyStartConfirmed, earlyStartReason, earlyStartConfirmedAtMs: earlyStartConfirmed ? Date.now() : null,
          clubAId: fixture.clubAId, clubBId: fixture.clubBId,
          bookingVersions, squadVersions, squads, used: req.body?.startRequested === true,
          startingLineups, sourceFormations,
          matchDayHistory: season.matchDayHistory || [],
          matchDays: season.matchDays || [],
          liveMatchesAtApproval: season.liveMatches || {},
          expiresAt: Timestamp.fromMillis(Date.now() + 60000),
        });
      });
      return res.json({approvalId, ...(startedMatch ? {match:startedMatch} : {})});
    } catch (error) {
      console.error("[Field match approval]", error.message);
      return res.status(400).json({
        error: error.message || "Match approval failed.",
      });
    }
};
exports.approveFieldMatchStart = onRequest(
  {region: "us-central1", invoker: "public", cors: true},
  (req, res) => exports.approvalHandler(req, res)
);

exports.getFieldFixtureRoster = onRequest(
  {region: "us-central1", invoker: "public", cors: true},
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).json({error: "Use POST."});
    try {
      const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/);
      if (!bearer) return res.status(401).json({error: "Sign in first."});
      await admin.auth().verifyIdToken(bearer[1], true);
      const {venueId, seasonId, fixtureId} = req.body || {};
      if ([venueId, seasonId, fixtureId].some(value =>
        typeof value !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(value))) {
        throw new Error("Invalid fixture reference.");
      }
      const db = getFirestore();
      const squads = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(db.doc(`leagueVenues/${venueId}`));
        const season = snapshot.data()?.league?.activeSeason;
        const fixture = season?.fixtures?.find(item => item.id === fixtureId);
        if (season?.id !== seasonId || season.status !== "active" ||
            !fixture?.matchDayId) throw new Error("This fixture is unavailable.");
        const commitStart = req.body?.startRequested === true;
        const deviceId = String(req.body?.deviceId || "");
        const requestId = String(req.body?.requestId || "");
        if (commitStart && (!/^[A-Za-z0-9_-]{8,160}$/.test(deviceId) ||
            !/^[A-Za-z0-9_-]{8,160}$/.test(requestId))) {
          throw new Error("The referee device or start request is missing. Reopen the fixture.");
        }
        const {loadFieldMatchRoster} = require("./fieldMatchRoster.js");
        const result = await loadFieldMatchRoster({
          transaction, db, venueId, season, fixture, requireMinimum: false,
        });
        return result.squads;
      });
      // Only lineup identities are returned; contributions and receipts stay private.
      return res.json({squads});
    } catch (error) {
      return res.status(400).json({error: error.message || "Could not load the lineup."});
    }
  }
);


function prepareApprovedFieldStart({season,fixture,user,staff,serverClubs,deviceId,requestId}) {
  const standbyId=(season.clubIds||[]).find(id=>id!==fixture.clubAId && id!==fixture.clubBId);
  if(!standbyId)throw new Error("Three registered Clubs are required to start a Field league fixture.");
  const prior=Object.values(season.liveMatches||{}).filter(item=>item.status==="live");
  const matchNo=Math.max(Number(season.currentMatchNo)||1,...prior.map(item=>(Number(item.matchNo)||0)+1));
  const teams=(season.clubIds||[]).map((id,index)=>{
    const club=serverClubs[index]?.data()||{};
    const name=String(club.name||season.invitations?.[id]?.clubName||id);
    return {id,name,label:name,players:[],logoUrl:String(club.transparentLogoUrl||club.logoUrl||club.branding?.logoUrl||""),
      captain:typeof club.captain==="string"?club.captain:String(club.captain?.fullName||club.captainName||"")};
  });
  return {fixtureId:fixture.id,liveDocumentId:fixture.id,gameFormat:season.gameFormat,matchNo,
    ...(fixture.pitchNumber?{pitchNumber:fixture.pitchNumber}:{}),
    ...(fixture.scheduledLocal?{scheduledLocal:fixture.scheduledLocal}:{}),
    standbyId,clubAId:fixture.clubAId,clubBId:fixture.clubBId,
    clubAName:fixture.clubAName||teams.find(team=>team.id===fixture.clubAId)?.name||fixture.clubAId,
    clubBName:fixture.clubBName||teams.find(team=>team.id===fixture.clubBId)?.name||fixture.clubBId,
    scoreA:0,scoreB:0,status:"live",startedByUid:user.uid,startedAt:FieldValue.serverTimestamp(),
    startRequestId:requestId,teams,controller:{uid:user.uid,deviceId,
      name:String(user.name||user.email||"Field official"),role:staff?.role||"field_manager",
      claimedAtMs:Date.now()}};
}
exports.prepareApprovedFieldStart=prepareApprovedFieldStart;
