const {createHash} = require("node:crypto");
const privacy = require("./playerPrivacy.cjs");
const safe = value => typeof value === "string" && /^[A-Za-z0-9_.~:-]{1,200}$/.test(value);
function sheetId(scope, matchKey) {
  if (!safe(matchKey)) throw new Error("This match needs a stable match ID.");
  if (!safe(scope?.clubId || scope?.venueId) || (scope.venueId && !safe(scope.seasonId))) throw new Error("Choose a valid football workspace.");
  return createHash("sha256").update(JSON.stringify([scope.venueId ? "field" : "club",scope.venueId || scope.clubId,scope.seasonId || "",matchKey])).digest("hex");
}
async function save({db,user,body,now=Date.now()}) {
  if (!user?.uid || !user.email_verified || user.cameraSession === true) throw new Error("Sign in as the referee before verifying kit numbers.");
  if (body.scope?.environment === "practice") throw new Error("Practice numbers must stay in the Practice session.");
  const policy = await import("./playerKitPolicy.mjs");
  const inputScope=body.scope || {};
  const scope=inputScope.venueId?{environment:"official",venueId:inputScope.venueId,seasonId:inputScope.seasonId}:{environment:"official",clubId:inputScope.clubId,seasonId:inputScope.seasonId || ""};
  const key = sheetId(scope,body.matchKey);
  const teams = policy.validateKitTeams(body.teams,{referee:true,requireNumbered:Boolean(scope.venueId)});
  if (teams.length !== 2) throw new Error("Verify both participating teams.");
  const ref = db.doc(`matchNumberSheets/${key}`);
  return db.runTransaction(async tx => {
    const sheet = await tx.get(ref);
    const revision = Number(sheet.data()?.revision || 0);
    if (revision !== body.expectedRevision) throw new Error("The referee's number sheet changed on another device. Reload it before saving.");
    let live;
    if (scope.venueId) {
      const [venueSnap,staffSnap,matchSnap] = await tx.getAll(db.doc(`leagueVenues/${scope.venueId}`),db.doc(`leagueVenues/${scope.venueId}/staff/${user.uid}`),db.doc(`leagueVenues/${scope.venueId}/seasons/${scope.seasonId}/matches/current`));
      const venue = venueSnap.data(), staff = staffSnap.data();
      if (!venue || venue.deleted || (venue.ownerUid !== user.uid && !(staff?.status === "active" && ["field_manager","assistant_manager","field_assistant","other_staff","referee"].includes(staff.role)))) throw new Error("Only active Field staff can verify this match's kit.");
      if (venue.league?.activeSeason?.id !== scope.seasonId) throw new Error("This Field season is no longer active.");
      live = matchSnap.data();
    } else {
      const [clubSnap,stateSnap,members] = await Promise.all([
        tx.get(db.doc(`clubs/${scope.clubId}`)),tx.get(db.doc(`clubs/${scope.clubId}/state/main`)),tx.get(db.collection(`clubs/${scope.clubId}/members`).where("uid","==",user.uid)),
      ]);
      const club = clubSnap.data();
      const active = members.docs.some(item=>privacy.owns(item.data(),user) && (item.data().status || "active")==="active" && ["admin","captain","referee"].includes(item.data().role));
      const captain = (club?.captainEmails || []).concat(club?.captainEmail || "",club?.captain?.email || "").some(email=>String(email).toLowerCase()===String(user.email).toLowerCase());
      const state = stateSnap.data()?.state || stateSnap.data();
      const season = state?.seasons?.find(item=>item.seasonId===state.activeSeasonId);
      live = season?.liveMatchDraft || state;
      if (!club || club.deleted || club.status==="deleted")throw new Error("This club is unavailable.");
      if (scope.seasonId && state?.activeSeasonId && scope.seasonId!==state.activeSeasonId)throw new Error("This club season changed. Reopen the match.");
      if (!privacy.adminOf(club,user) && !active && !captain) throw new Error("Only this club's authenticated referee, captain or administrator can verify kit.");
    }
    if (!live) throw new Error("Open the current match before verifying kit.");
    const controller = live.controller || live.liveMatchController;
    if (controller?.uid && controller.uid !== user.uid) throw new Error("Take over the referee controls before changing this number sheet.");
    const current = live.currentMatch || {};
    const playingIds = [current.teamAId || current.clubAId,current.teamBId || current.clubBId].filter(Boolean).map(String).sort();
    if (playingIds.length === 2 && JSON.stringify(playingIds) !== JSON.stringify(teams.map(team=>team.id).sort())) throw new Error("The participating teams changed. Reopen the lineups.");
    const saved = {scope,matchKey:body.matchKey,teams,rosterSignature:policy.kitRosterSignature(teams),revision:revision+1,verifiedAtMs:now,verifiedByUid:user.uid};
    tx.set(ref,saved);
    // Append-only audit survives last-minute corrections and later matches.
    tx.set(ref.collection("revisions").doc(String(revision+1)),saved);
    return {sheetId:key,...saved};
  });
}
module.exports = {save,sheetId};
