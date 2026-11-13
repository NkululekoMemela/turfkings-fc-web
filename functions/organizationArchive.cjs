const ROOTS = Object.freeze({club: "clubs", field: "leagueVenues"});
const validId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(value);
const text = value => typeof value === "string" ? value.trim() : "";
const archived = data => data.deleted === true || data.status === "deleted";
const hasLiveFieldMatch = season => Object.values(season?.liveMatches || {})
  .some(match => match?.status === "live");
const hasLiveClubMatch = state => [state, ...(Array.isArray(state?.seasons) ? state.seasons : [])]
  .some(item => item?.liveMatchDraft?.status === "running" || item?.hasLiveMatch === true || item?.running === true);

async function manageOrganizationArchive({body, user, db, stamp, fail}) {
  const director = user.email_verified === true && !user.cameraSession &&
    text(user.email).toLowerCase() === "nkululekolerato@gmail.com";
  const staff = !director && user.email_verified === true && !user.cameraSession
    ? (await db.doc(`fanmOperations/main/staff/${user.uid}`).get()).data() : null;
  if (!director && !(staff?.role === "operations_manager" && staff.status === "active")) {
    fail("FANM management access is required.", 403);
  }
  const now = Date.now();
  const {action, kind, id} = body;
  if (kind !== "club" && kind !== "field") fail("Choose a Field or Club.");
  const collection = db.collection(ROOTS[kind]);
  if (action === "organizationAccess") return {canManage:true};
  if (action === "organizationArchived") {
    const cursor = body.cursor;
    if (cursor != null && !validId(cursor)) fail("Invalid archive page.");
    let query = collection.where(kind === "field" ? "deleted" : "organizationArchive.active", "==", true).orderBy("__name__");
    if (cursor) query = query.startAfter(collection.doc(cursor));
    const {docs} = await query.limit(26).get();
    const page = docs.slice(0, 25);
    return {
      items: page.map(doc => ({id: doc.id, name: text(doc.data().name) || doc.id,
        restoreUntilMs: doc.data().organizationArchive?.restoreUntilMs || null,
        canRestore: doc.data().organizationArchive?.active === true &&
          (!doc.data().organizationArchive.restoreUntilMs || doc.data().organizationArchive.restoreUntilMs > now)})),
      nextCursor: docs.length > 25 ? page.at(-1).id : null,
    };
  }
  if (!["organizationArchive", "organizationRestore", "organizationDelete"].includes(action) || !validId(id)) {
    fail("Choose a valid organisation.");
  }
  if (action === "organizationDelete") fail("Use the 30-day recovery archive instead.",409);
  const restoring = action === "organizationRestore";
  const reason = text(body.reason);
  if (reason.length < 10 || reason.length > 500) fail("Give a reason of 10 to 500 characters.");
  return db.runTransaction(async tx => {
    const ref = collection.doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) fail("This organisation no longer exists.", 404);
    const data = snap.data();
    const confirmation = `${restoring ? "RESTORE" : "ARCHIVE"} ${id}`;
    if (text(body.confirmation) !== confirmation) fail(`Type ${confirmation} to confirm.`);
    const prior = data.organizationArchive;
    let patch;
    if (restoring) {
      if (prior?.restoreUntilMs && prior.restoreUntilMs <= now) fail("The 30-day recovery period has ended.",409);
      if (prior?.active !== true || !prior.previous) fail("This organisation has no recoverable archive record.", 409);
      patch = {status: prior.previous.status, deleted: false, organizationArchive: {active: false}};
      if (kind === "field") patch.visibility = prior.previous.visibility;
    } else {
      if (prior?.active === true) return {id, archived: true};
      if (archived(data) && !(kind === "field" && data.visibility?.listed === true)) {
        fail("This organisation was already removed by the older controls.", 409);
      }
      if (kind === "club") {
        if (["turf-kings", "turf-kings-fc"].includes(id) || data.clubType === "company" || data.companyId) {
          fail("This protected Club must be handled separately.", 409);
        }
        const [state, membership] = await Promise.all([
          tx.get(ref.collection("state").doc("main")),
          tx.get(db.doc(`clubFieldMemberships/${id}`)),
        ]);
        const stateData = state.data();
        if (hasLiveClubMatch(stateData?.state || stateData)) fail("End the live Club match before archiving.", 409);
        if (membership.data()?.status === "active") fail("Remove the Club's active Field membership before archiving.", 409);
      } else {
        const season = data.league?.activeSeason;
        if (hasLiveFieldMatch(season)) fail("End the live Field match before archiving.", 409);
        if (season?.id && validId(season.id)) {
          const live = await tx.get(ref.collection("seasons").doc(season.id).collection("matches")
            .where("status", "==", "live").limit(1));
          if (!live.empty) fail("End the live Field match before archiving.", 409);
        }
        if (season?.status === "active" && season.schedulePublishedAtMs) {
          fail("Close the published Field season before archiving.", 409);
        }
        const linked = await tx.get(db.collection("clubFieldMemberships").where("venueId", "==", id));
        if (linked.docs.some(doc => doc.data().status === "active")) {
          fail("Remove active Club memberships before archiving this Field.", 409);
        }
      }
      const previous = {status: archived(data) ? "active" : data.status || "active", deleted: false};
      if (kind === "field") previous.visibility = data.visibility || {listed: false};
      patch = {status: "deleted", deleted: true, organizationArchive: {active: true, previous, archivedAtMs:now, restoreUntilMs:now+30*86400000}};
      if (kind === "field") patch.visibility = {...data.visibility, listed: false};
    }
    tx.update(ref, patch);
    tx.create(db.collection("organizationArchiveAudit").doc(), {
      kind, organizationId: id, actorUid: user.uid, reason,
      action: restoring ? "restore" : "archive", at: stamp(),
    });
    return {id, archived: !restoring};
  });
}

module.exports = {manageOrganizationArchive};
