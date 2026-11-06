const {createHash} = require("node:crypto");
const {FieldValue} = require("firebase-admin/firestore");
const service = require("./fieldSeasonSquadService");
const {applyMatchBibs}=require("./matchBibAllocation.cjs");
const {loadSeasonStartSquad} = require("./fieldSeasonStartSquad");

const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);
const fingerprint = value => createHash("sha256")
  .update(JSON.stringify(value)).digest("hex");

function project({scope, day, fixture, candidates, saved, carried = []}) {
  const revision = fingerprint({
    scope, date: day.dateLocal, fixtureId: fixture.id,
    scheduledLocal: fixture.scheduledLocal || "",
    players: candidates.map(player => ({
      memberId: player.memberId, sourcePlayerId: player.sourcePlayerId,
      fullName: player.fullName,
      jerseyNumber: player.jerseyNumber ?? null,
      ownsNumberedBib: player.ownsNumberedBib === true,
      bibColor: player.bibColor || "",
      originalMemberId: player.originalMemberId || "",
    })).sort((a, b) => a.memberId.localeCompare(b.memberId)),
  });
  const selected = Array.isArray(saved?.memberIds) ? saved.memberIds : [];
  const byId = new Map(candidates.map(player => [player.memberId, player]));
  const validSelection = selected.length >= 5 && selected.length <= 6 &&
    new Set(selected).size === selected.length && selected.every(id => byId.has(id));
  const currentSelection = validSelection && saved?.fingerprint === revision;
  const draftIds = validSelection ? selected : carried.length ? carried :
    candidates.slice(0, 6).map(player => player.memberId);
  const numbers = currentSelection ? saved?.kitNumbers || {} : {};
  const allocated = applyMatchBibs(draftIds.map(id=>byId.get(id)),currentSelection ? saved?.kitAssignments || {} : {});
  const players = allocated.map(player => {
    return Object.hasOwn(numbers, player.sourcePlayerId)
      ? {...player, jerseyNumber: numbers[player.sourcePlayerId], kitNumberSource: "captain"} : player;
  });
  const kitReady = players.length >= 5 && players.length <= 6 &&
    new Set(players.map(player => Number(player.jerseyNumber))).size === players.length &&
    players.every(player => (player.ownsNumberedBib === true || player.matchBib?.available === true || (player.matchBib?.assigned === true && player.matchBib?.allocationSource === "field")) &&
      String(player.bibColor || "").trim() && player.jerseyNumber !== null &&
      player.jerseyNumber !== undefined && /^\d{1,3}$/.test(String(player.jerseyNumber)) &&
      Number(player.jerseyNumber) === Number(player.matchBib?.number ?? byId.get(player.memberId).jerseyNumber));
  const confirmed = currentSelection && kitReady && saved?.kitConfirmed === true;
  return {
    matchDayId: day.id, dateLocal: day.dateLocal,
    fixtureId: fixture.id, fingerprint: revision,
    confirmed, ready: kitReady, rosterSource: validSelection ? "captain" : carried.length ? "carried" : "season",
    needsSelection: draftIds.length < 5,
    selectedMemberIds: draftIds, players, kitAssignments: currentSelection ? saved?.kitAssignments || {} : {},
    kitNumbers: Object.fromEntries(players.map(player => [player.sourcePlayerId, player.jerseyNumber ?? null])),
    submittedAtMs: confirmed ? Number(saved.submittedAtMs || 0) : 0,
  };
}

function sendWindow({day, fixture, now = Date.now()}) {
  // Fixtures have already been released by loadDay. Clubs may prepare early.
  const opensAtMs = 0;
  const closesAtMs = Date.parse(`${fixture.scheduledLocal}+02:00`);
  if (!day?.dateLocal || fixture.scheduledLocal?.slice(0, 10) !== day.dateLocal || !Number.isFinite(closesAtMs)) {
    throw new Error("The fixture needs a valid date and kickoff time.");
  }
  // A carried season roster needs no weekly submission. Captain edits stay open until kickoff.
  const testException = false;
  return {
    opensAtMs, closesAtMs, deadlineAtMs: closesAtMs, testException,
    sendAllowed: testException || (now >= opensAtMs && now < closesAtMs),
  };
}

async function loadDay({tx, db, scope, matchDayId}) {
  if (!validId(matchDayId)) throw new Error("Choose a valid match day.");
  const context = await service.loadContext(tx, db, scope);
  if (context.season.gameFormat !== "5_V_5") {
    throw new Error("Five or six-player squads apply to five-a-side leagues.");
  }
  if (!context.season.schedulePublishedAtMs) {
    throw new Error("The Field must release its fixtures first.");
  }
  const policy = await import("./fieldSeasonAvailabilityPolicy.mjs");
  const live = await tx.get(db.doc(
    `leagueVenues/${scope.venueId}/seasons/${scope.seasonId}/matches/current`
  ));
  const {day, fixture} = policy.assertClubMatchDayEditable({
    season: context.season, clubId: scope.clubId, matchDayId,
    liveMatch: live.data() || null,
  });
  const base = await loadSeasonStartSquad({transaction: tx, db, scope, includeRegistered: true});
  const availability = context.squad?.matchDayAvailability?.[matchDayId] || {};
  const replacements = context.squad?.matchDayReplacements?.[matchDayId] || {};
  const candidates = [];
  const vacancies = [];
  const seenMembers = new Set();
  const seenPlayers = new Set();

  for (const original of base?.eligible || []) {
    let player = original;
    if (availability[original.memberId]?.status === "unavailable") {
      const cover = replacements[original.memberId];
      if (cover?.invitationStatus !== "accepted") {
        vacancies.push({
          memberId: original.memberId, fullName: original.fullName,
          coverStatus: cover?.invitationStatus || "",
        });
        continue;
      }
      if (![cover.memberId, cover.sourcePlayerId].every(validId) ||
          cover.originalMemberId !== original.memberId ||
          cover.memberId === original.memberId ||
          Object.values(context.squad.entries || {}).some(entry =>
            entry.memberId === cover.memberId ||
            entry.sourcePlayerId === cover.sourcePlayerId)) {
        throw new Error("Correct the replacement player link.");
      }
      const [memberSnap, profileSnap] = await tx.getAll(
        context.clubRef.collection("members").doc(cover.memberId),
        context.clubRef.collection("players").doc(cover.sourcePlayerId)
      );
      const member = memberSnap.data();
      const profile = profileSnap.data();
      if (!member || (member.status || "active") !== "active" ||
          member.playerId !== cover.sourcePlayerId ||
          !profile || String(profile.status || "active").toLowerCase() !== "active") {
        vacancies.push({
          memberId: original.memberId, fullName: original.fullName,
          coverStatus: "invalid",
        });
        continue;
      }
      const fullName = String(profile.fullName || profile.displayName ||
        profile.name || profile.playerName || "").trim();
      if (!fullName) throw new Error("The replacement needs a registered name.");
      player = {
        memberId: cover.memberId, sourcePlayerId: cover.sourcePlayerId,
        fullName, clubId: scope.clubId,
        jerseyNumber: profile.jerseyNumber ?? member.jerseyNumber ?? null,
        ownsNumberedBib: profile.ownsNumberedBib ?? member.ownsNumberedBib ?? false,
        bibColor: profile.bibColor || member.bibColor || "",
        mentality: profile.mentality ?? null,
        shooting: profile.shooting ?? null,
        originalMemberId: original.memberId, isFillIn: true,
      };
    }
    if (seenMembers.has(player.memberId) || seenPlayers.has(player.sourcePlayerId)) {
      throw new Error("A player cannot occupy two squad places.");
    }
    seenMembers.add(player.memberId);
    seenPlayers.add(player.sourcePlayerId);
    candidates.push(player);
  }
  const [{fixtureColours,automaticFixtureBibs},{kitColourKey,teamBibColours}]=await Promise.all([import("./automaticFixtureKit.mjs"),import("./opponentKitColours.mjs")]);
  const [homeClub,awayClub]=await tx.getAll(db.doc(`clubs/${fixture.clubAId}`),db.doc(`clubs/${fixture.clubBId}`));
  const stockConfig=(await tx.get(db.doc(`leagueVenues/${scope.venueId}/bibHireConfig/stock`))).data()||{};
  const ownedStock=stockConfig.confirmedAtMs?stockConfig.stock||[]:[];
  const {bibCustodySnapshot,playerCarryPins,readBibCustody}=await import("./fieldBibCustody.mjs");
  const loans=await readBibCustody(db,tx,scope.venueId);
  const confirmedStock=bibCustodySnapshot(ownedStock,loans).availableStock;
  const carryPins=playerCarryPins(loans,scope.clubId,matchDayId);
  const colours=fixtureColours(homeClub.data()||{},awayClub.data()||{},ownedStock);
  const matchColour=scope.clubId===fixture.clubAId?colours.home:colours.away;
  const planned=automaticFixtureBibs(candidates,matchColour,confirmedStock,carryPins);
  candidates.splice(0,candidates.length,...planned);
  candidates.sort((a, b) => a.fullName.localeCompare(b.fullName));
  let submission = project({
    scope, day, fixture, candidates,
    saved: context.squad?.matchDaySubmissions?.[matchDayId],
    carried: require("./rollingFieldSquad.cjs").carriedMemberIds({season:context.season,squad:context.squad,day,clubId:scope.clubId,candidates}),
  });
  if (submission.players.length >= 5) {
    const selectedPlayers = automaticFixtureBibs(submission.players, matchColour,confirmedStock,carryPins);
    submission = project({scope, day, fixture, candidates: selectedPlayers});
    submission.rosterSource = "season";
  }
  submission.stockConfirmed=Boolean(stockConfig.confirmedAtMs);
  submission.stockRevision=stockConfig.revision||0;
  submission.matchColour=matchColour;
  submission.automaticKit=true;
  if(teamBibColours(submission.players).some(c=>c!==kitColourKey(matchColour))){submission.ready=false;submission.confirmed=false;}
  return {...context, day, fixture, candidates, vacancies, submission};
}

async function loadOpponentDay({tx,db,scope,matchDayId}) {
  const [club,membership,squad]=await tx.getAll(db.doc(`clubs/${scope.clubId}`),db.doc(`clubFieldMemberships/${scope.clubId}`),db.doc(`leagueSeasonSquads/${scope.venueId}~${scope.seasonId}~${scope.clubId}`));
  if(!club.data()||membership.data()?.status!=="active"||membership.data()?.venueId!==scope.venueId||!squad.data())return null;
  return loadDay({tx,db,scope,matchDayId});
}

async function getClubDay({db, user, body}) {
  const {venueId, seasonId, clubId, matchDayId} = body || {};
  const scope = {venueId, seasonId, clubId};
  return db.runTransaction(async tx => {
    const data = await loadDay({tx, db, scope, matchDayId});
    if (!service.canManageSquad(data.club, user)) {
      throw new Error("Only this Club's captain or administrator can confirm its squad.");
    }
    const opponentId=[data.fixture.clubAId,data.fixture.clubBId].find(id=>id!==clubId);
    const opponent=await loadOpponentDay({tx,db,scope:{venueId,seasonId,clubId:opponentId},matchDayId});
    const {teamBibColours}=await import("./opponentKitColours.mjs");
    return {
      opponentColours:teamBibColours(opponent?.submission?.players||[]),
      ...data.submission, candidates: data.candidates,
      vacancies: data.vacancies,
      ...sendWindow({
        day: data.day, fixture: data.fixture, testMode: body.testMode,
      }),
    };
  });
}

async function submit({db, user, body, now = Date.now()}) {
  const {venueId, seasonId, clubId, matchDayId, memberIds} = body || {};
  const scope = {venueId, seasonId, clubId};
  if (!Array.isArray(memberIds) || memberIds.length < 5 ||
      memberIds.length > 6 ||
      new Set(memberIds).size !== memberIds.length ||
      !memberIds.every(validId)) {
    throw new Error("Select five or six different players. Six is the maximum.");
  }
  const kitPolicy=await import("./playerKitPolicy.mjs");
  const {assertLeagueBibs}=await import("./leagueBibPolicy.mjs");
  return db.runTransaction(async tx => {
    const data = await loadDay({tx, db, scope, matchDayId});
    if (!service.canManageSquad(data.club, user)) {
      throw new Error("Only this Club's captain or administrator can send its squad.");
    }
    if(!data.submission.stockConfirmed)throw new Error("Ask the Field to confirm bib stock first.");
    const window = sendWindow({
      day: data.day, fixture: data.fixture, now, testMode: body.testMode,
    });
    if (!window.sendAllowed) {
      throw new Error("Kickoff has arrived. Ask the referee to make any last-minute lineup changes.");
    }
    const eligible = new Set(data.candidates.map(player => player.memberId));
    if (!memberIds.every(id => eligible.has(id))) {
      throw new Error("A selected player is unavailable or no longer eligible. Review the matrix.");
    }
    if(body.kitConfirmed !== true)throw new Error("Confirm the numbered bibs available for this match, including club or arranged hire bibs.");
    const requested=body.kitNumbers || {};
    const allocatedPlayers=applyMatchBibs(data.candidates.filter(player=>memberIds.includes(player.memberId)),body.kitAssignments || {});
    assertLeagueBibs(allocatedPlayers,requested);
    const {kitColourKey,teamBibColours}=await import("./opponentKitColours.mjs");
    if(teamBibColours(allocatedPlayers).some(c=>c!==kitColourKey(data.submission.matchColour)))throw Error("Every bib must match the fixture team colour: "+data.submission.matchColour);
    const opponentId=[data.fixture.clubAId,data.fixture.clubBId].find(id=>id!==clubId);
    const opponent=await loadOpponentDay({tx,db,scope:{venueId,seasonId,clubId:opponentId},matchDayId});
    const {assertOpponentColours}=await import("./opponentKitColours.mjs");
    assertOpponentColours({[clubId]:allocatedPlayers,[opponentId]:opponent?.submission?.players||[]});
    if(Object.keys(requested).some(key=>!memberIds.some(memberId=>data.candidates.find(player=>player.memberId===memberId)?.sourcePlayerId===key)))throw new Error("Only assign numbers to selected squad players.");
    const checkedKit=kitPolicy.validateKitTeams([{id:clubId,label:data.club.name || clubId,players:memberIds.map(memberId=>{
      const player=allocatedPlayers.find(item=>item.memberId===memberId);
      return {key:player.sourcePlayerId,name:player.fullName,number:Object.hasOwn(requested,player.sourcePlayerId)?requested[player.sourcePlayerId]:player.jerseyNumber ?? null};
    })}])[0];
    const kitNumbers=Object.fromEntries(checkedKit.players.map(row=>[row.key,row.number]));
    // Field-owned copy of the captain's submitted match-day roster.
    const selectedPlayers = memberIds.map(memberId =>
      allocatedPlayers.find(player => player.memberId === memberId)
    ).map(player => ({
      clubId,
      memberId: player.memberId,
      sourcePlayerId: player.sourcePlayerId,
      fullName: player.fullName,
      jerseyNumber: kitNumbers[player.sourcePlayerId] ?? null,
      kitNumberSource: "captain",
      ...(player.matchBib ? {matchBib:player.matchBib} : {}),
      ownsNumberedBib: player.ownsNumberedBib === true,
      bibColor: player.bibColor || "",
      photoData: player.photoData || "",
      mentality: player.mentality ?? null,
      shooting: player.shooting ?? null,
      originalMemberId: player.originalMemberId || "",
      isFillIn: player.isFillIn === true,
    }));
    tx.set(db.doc(
      `leagueVenues/${venueId}/seasons/${seasonId}/` +
      `fieldMatchDayManifests/${matchDayId}/clubs/${clubId}`
    ), {
      version: 1,
      venueId, seasonId, clubId, matchDayId,
      fixtureId: data.fixture.id,
      dateLocal: data.day.dateLocal,
      scheduledLocal: data.fixture.scheduledLocal || "",
      name: data.club.name || data.club.shortName || clubId,
      logoUrl: data.club.branding?.logoUrl ||
        data.club.transparentLogoUrl || data.club.logoUrl || "",
      fingerprint: data.submission.fingerprint,
      selectedMemberIds: memberIds,
      players: selectedPlayers,
      confirmed: true,
      kitConfirmed: true, kitConfirmedByUid: user.uid, kitRequirementVersion: 1,
      submissionDeadlineAtMs: window.deadlineAtMs,
      status: "confirmed",
      submittedByUid: user.uid,
      submittedAtMs: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(data.squadRef, {
      [`matchDaySubmissions.${matchDayId}`]: {
        memberIds, kitNumbers, kitAssignments: Object.fromEntries(allocatedPlayers.filter(player=>player.matchBib?.available===true).map(player=>[player.sourcePlayerId,{source:player.matchBib.source,number:player.matchBib.number,color:player.matchBib.color}])), kitConfirmed: true, fingerprint: data.submission.fingerprint,
        submittedByUid: user.uid, submittedAtMs: now,
        submittedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {status: "confirmed", matchDayId};
  });
}

async function getFieldDay({db, user, body}) {
  const {venueId, seasonId, matchDayId} = body || {};
  if (![venueId, seasonId, matchDayId].every(validId)) {
    throw new Error("Choose a valid Field match day.");
  }
  return db.runTransaction(async rawTx => {
    const tx=require("./fieldReadCache.cjs").cacheFieldReads(rawTx);
    const venueRef = db.doc(`leagueVenues/${venueId}`);
    const [venueSnap, staffSnap] = await tx.getAll(
      venueRef, venueRef.collection("staff").doc(user.uid)
    );
    const venue = venueSnap.data();
    const season = venue?.league?.activeSeason;
    if (season?.id !== seasonId || season.status !== "active" ||
        !season.schedulePublishedAtMs) throw new Error("This season is unavailable.");
    const day = season.matchDays?.find(item => item.id === matchDayId);
    if (!day || day.status !== "scheduled") throw new Error("Choose an upcoming match day.");
    let allowed = venue.ownerUid === user.uid ||
      venue.adminUids?.includes(user.uid) ||
      staffSnap.data()?.status === "active";
    const clubIds = season.clubIds || [];
    if (clubIds.length > 100) throw new Error("Invalid league capacity.");
    const clubs = [];
    for (const clubId of clubIds) {
      service.squadId({venueId, seasonId, clubId});
    }
    const clubSnapshots = clubIds.length
      ? await tx.getAll(...clubIds.map(clubId => db.doc(`clubs/${clubId}`)))
      : [];
    if (clubSnapshots.some(snapshot =>
      service.canManageSquad(snapshot.data(), user))) allowed = true;
    const squadSnapshots = !allowed && clubIds.length
      ? await tx.getAll(...clubIds.map(clubId => db.doc(
          `leagueSeasonSquads/${venueId}~${seasonId}~${clubId}`
        )))
      : [];
    for (const [index, clubId] of clubIds.entries()) {
      const clubSnap = clubSnapshots[index];
      const club = clubSnap.data();
      if (service.canManageSquad(club, user)) allowed = true;
      if (!allowed) {
        const squadSnap = squadSnapshots[index];
        const entries = Object.values(squadSnap.data()?.entries || {})
          .filter(entry => validId(entry.memberId) &&
            entry.invitationStatus === "accepted");
        if (entries.length > 30) throw new Error("Invalid squad capacity.");
        if (entries.length) {
          const members = await tx.getAll(...entries.map(entry =>
            db.doc(`clubs/${clubId}/members/${entry.memberId}`)));
          allowed = entries.some((entry, index) =>
            service.ownsMember(members[index].data(), user) &&
            members[index].data()?.playerId === entry.sourcePlayerId);
        }
      }
      clubs.push({
        clubId, name: club?.name || club?.shortName || clubId,
        canManageFormation: service.canManageSquad(club, user),
        logoUrl: club?.branding?.logoUrl || club?.transparentLogoUrl || club?.logoUrl || "",
      });
    }
    if (!allowed) throw new Error("Sign in as Field staff or a participating Club member.");
    const currentLive=(await tx.get(db.doc(`leagueVenues/${venueId}/seasons/${seasonId}/matches/current`))).data();
    const result = await Promise.all(clubs.map(async club => {
      const fixture = (season.fixtures || []).find(item => item.matchDayId === matchDayId &&
        [item.clubAId, item.clubBId].includes(club.clubId));
      if (!fixture) return {...club, status: "bye", players: []};
      const liveRoster=require("./rollingFieldSquad.cjs").liveDayRoster({live:currentLive,season,matchDayId,clubId:club.clubId});
      if(liveRoster)return {...club,...liveRoster};
      const completed=require("./rollingFieldSquad.cjs").completedDayRoster({season,fixture,clubId:club.clubId});
      if(completed)return {...club,...completed};
      const data = await loadDay({tx, db, scope: {venueId, seasonId, clubId: club.clubId}, matchDayId});
      const squad = data.submission;
      return {...club, ...squad,
        status: squad.confirmed ? "confirmed" : squad.ready ? "season_roster" : "needs_attention",
        availablePlayers: data.candidates, candidateCount: data.candidates.length, vacancies: data.vacancies.length};
    }));
    return {stockPolicyVersion:1,matchDayId, dateLocal: day.dateLocal, clubs: result};
  });
}

exports.project = project;
exports.sendWindow = sendWindow;
exports.loadDay = loadDay;
exports.submit = submit;
exports.getClubDay = getClubDay;
exports.getFieldDay = getFieldDay;
