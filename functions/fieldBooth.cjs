const {onRequest} = require('firebase-functions/v2/https');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {randomBytes, createHash} = require('node:crypto');
const {isOperator, holdsBooth, validGrant, checkedPatch, transfer} = require('./fieldBoothPolicy.cjs');
const valid = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(s);
const hash = value => createHash('sha256').update(value).digest('hex');
function denied(message) { const error = Error(message); error.status = 403; return error; }

// All takeover decisions and official-booth writes share this transaction.
// A replacement is a match guest, never a staff member or administrator.
async function operate({db, user, body, now = Date.now()}) {
  const {op, deviceId} = body;
  if(["join","createInvite","approveInvite"].includes(op))throw denied("Temporary referee access is disabled. A registered Field official can request takeover.");
  if (body.environment && body.environment !== 'official') throw denied('Practice must stay separate from the official league.');
  if (!valid(deviceId)) throw denied('Use this phone to open the referee booth.');
  const profile = {uid: user.uid, deviceId,
    name: String(user.name || user.email || 'Field referee').slice(0, 100), role: 'referee'};
  let venueId = body.venueId, seasonId = body.seasonId;
  let inviteRef = null;
  if (op === 'join') {
    if (!/^[A-Za-z0-9_-]{12}$/.test(body.code || '')) throw denied('Check the handover code.');
    inviteRef = db.doc(`fieldRefereeInvites/${hash(body.code)}`);
    const invite = await inviteRef.get();
    if (!invite.exists) throw denied('This handover code has expired.');
    ({venueId, seasonId} = invite.data());
  }
  if (![venueId, seasonId].every(valid)) throw denied('Choose a valid Field match.');
  const venueRef = db.doc(`leagueVenues/${venueId}`);
  const liveRef = venueRef.collection('seasons').doc(seasonId).collection('matches').doc('current');
  return db.runTransaction(async tx => {
    const [v, l, s] = await Promise.all([tx.get(venueRef), tx.get(liveRef),
      tx.get(venueRef.collection('staff').doc(user.uid))]);
    if (!v.exists || !l.exists) throw denied('No saved live match was found.');
    const venue = v.data(), live = l.data(), staff = s.exists ? s.data() : null;
    const season = venue.league?.activeSeason;
    if (season?.id !== seasonId) throw denied('This Field season has ended.');
    if (body.fixtureId && body.fixtureId !== live.fixtureId) throw denied('The active match changed. Reopen the correct match.');
    if (op === 'finish' && live.status === 'completed' && live.completedByUid === user.uid &&
        body.fixtureId === live.fixtureId) return {completed: true};
    const operator = isOperator(venue, staff, user.uid);
    if(operator&&staff){profile.name=String(staff.fullName||staff.name||profile.name).slice(0,100);profile.role=staff.role||"referee";}
    const guest = false; // Temporary delegation is disabled, including previously approved grants.
    const controls = holdsBooth(live, user.uid, deviceId) && (operator || guest);
    const request = live.liveMatchTakeoverRequest;
    const context = state => ({venue: {id: venueId, name: venue.name, logoUrl: venue.logoUrl || ''},
      season, live: state, teams: state.teams || [], guest: !operator});
    const log = (action, details) => tx.create(venueRef.collection('actionLog').doc(), {
      venueId, seasonId, fixtureId: live.fixtureId, action, label: 'Referee handover',
      details, actorUid: user.uid, actorEmail: user.email || '', actorName: profile.name,
      at: FieldValue.serverTimestamp(),
    });
    const write = patch => tx.update(liveRef, {...patch, updatedAtMs: now, updatedAt: FieldValue.serverTimestamp()});
    const readyLive = () => { if (live.status !== 'live') throw denied('This match has finished.'); };
    if (op === 'join') {
      readyLive();
      const inv = await tx.get(inviteRef), invite = inv.data();
      if (!invite || invite.expiresAtMs <= now || invite.fixtureId !== live.fixtureId ||
          invite.epoch !== live.boothEpoch || live.boothInviteId !== inviteRef.id || invite.used) {
        throw denied('This handover code has expired. Ask the referee for a new code.');
      }
      if (invite.requester && (invite.requester.uid !== user.uid || invite.requester.deviceId !== deviceId)) {
        throw denied('Another replacement is waiting for approval. Ask for a new code.');
      }
      if (live.liveMatchController?.uid === user.uid) throw denied('Use the replacement’s own account.');
      tx.update(inviteRef, {requester: profile});
      write({boothInvite: {id: inviteRef.id, expiresAtMs: invite.expiresAtMs, requester: profile}});
      return {venueId, seasonId, waiting: true};
    }
    if (op === 'context') {
      if (!operator && !guest) throw denied('The referee has not approved this account, or this match has ended.');
      if (operator && live.status === 'live' && (!live.liveMatchController?.deviceId || controls) && live.boothVersion !== 1) {
        const next = {...live, liveMatchController: live.liveMatchController?.deviceId ? live.liveMatchController : profile,
          boothVersion: 1, boothEpoch: randomBytes(16).toString('hex'), boothLastSeq: 0};
        write({boothVersion: 1, boothEpoch: next.boothEpoch, boothLastSeq: 0, liveMatchController: next.liveMatchController});
        return context(next);
      }
      return context(live);
    }
    readyLive();
    if (op === 'requestTakeover') {
      if (!operator) throw denied('Only registered Field officials can recover an unattended match.');
      if (controls) return context(live);
      if (request?.status === 'pending' && request.requester?.deviceId !== deviceId &&
          Date.parse(request.expiresAtISO) + 60000 > now) throw denied('Another official is already requesting this match.');
      const next = {status: 'pending', requester: profile, currentController: live.liveMatchController || null,
        requestedAtISO: new Date(now).toISOString(), expiresAtISO: new Date(now + 15000).toISOString()};
      write({liveMatchTakeoverRequest: next});
      log('referee_recovery_requested', `${profile.name} requested control of ${live.teamALabel || 'the home club'} vs ${live.teamBLabel || 'the away club'}.`);
      return {requested: true};
    }
    if (op === 'rejectTakeover') {
      if (!controls) throw denied('Only the controlling referee can decline this request.');
      write({liveMatchTakeoverRequest: request ? {...request, status: 'rejected'} : null});
      log('referee_recovery_declined', `${profile.name} kept control of the match.`);
      return {rejected: true};
    }
    if (op === 'acceptTakeover' || op === 'takeover') {
      if (request?.status !== 'pending') throw denied('Request recovery again.');
      const target = request.requester;
      if (op === 'acceptTakeover' ? !controls : !operator || target?.uid !== user.uid ||
          target?.deviceId !== deviceId || !Number.isFinite(Date.parse(request.expiresAtISO)) ||
          now < Date.parse(request.expiresAtISO)) throw denied('The recovery request is not ready.');
      const targetStaff = await tx.get(venueRef.collection('staff').doc(target.uid));
      if (!isOperator(venue, targetStaff.data(), target.uid)) throw denied('The replacement is no longer a Field official.');
      const next = transfer(live, target, now);
      write({...next, boothGuest: null, boothInvite: null});
      log('referee_handed_over', `${target.name} took over from ${live.liveMatchController?.name || 'the previous referee'}.`);
      return context(next);
    }
    if (!controls) throw denied('This phone no longer controls the match. Your local record has been kept for review.');
    if (body.epoch !== live.boothEpoch && !['createInvite'].includes(op)) throw denied('The referee session changed. Reopen the match.');
    if (op === 'createInvite') {
      if (!operator) throw denied('Only a registered Field official can appoint a temporary referee.');
      const code = randomBytes(9).toString('base64url');
      const id = hash(code), expiresAtMs = now + 5 * 60000;
      const ref = db.doc(`fieldRefereeInvites/${id}`);
      tx.create(ref, {venueId, seasonId, fixtureId: live.fixtureId, epoch: live.boothEpoch,
        expiresAtMs, createdByUid: user.uid, used: false});
      write({boothInviteId: id, boothInvite: {id, expiresAtMs, requester: null}});
      return {code, expiresAtMs};
    }
    if (op === 'approveInvite') {
      if (!operator || !live.boothInviteId) throw denied('Create a new handover code.');
      const ref = db.doc(`fieldRefereeInvites/${live.boothInviteId}`), snapshot = await tx.get(ref);
      const invite = snapshot.data(), target = invite?.requester;
      if (!target || invite.used || invite.expiresAtMs <= now || invite.epoch !== live.boothEpoch ||
          target.uid !== body.targetUid || target.deviceId !== body.targetDeviceId) throw denied('This handover request has expired or changed.');
      const next = transfer(live, target, now);
      const boothGuest = {uid: target.uid, deviceId: target.deviceId, fixtureId: live.fixtureId,
        epoch: next.boothEpoch, expiresAtMs: now + 6 * 3600000, approvedByUid: user.uid};
      tx.update(ref, {used: true});
      write({...next, boothGuest, boothInvite: null});
      log('temporary_referee_approved', `${profile.name} handed this match to ${target.name}. Access ends with this match.`);
      return {approved: true};
    }
    if (op === 'sync') {
      if (!Number.isSafeInteger(body.seq) || body.seq < 1) throw denied('Invalid saved action.');
      if (body.seq <= Number(live.boothLastSeq || 0)) return {ack: live.boothLastSeq};
      if (body.seq !== Number(live.boothLastSeq || 0) + 1) throw denied('A saved action is missing. Keep this phone for recovery.');
      const patch = checkedPatch(body.patch);
      if (patch.confirmedLineupSnapshot) {
        const policy = await import('./playerKitPolicy.mjs');
        const snapshots = patch.confirmedLineupSnapshot;
        const ids = [live.teamAId, live.teamBId];
        if (Object.keys(snapshots).length !== 2 || !ids.every(id => snapshots[id]?.kitVerification)) throw denied('Verify both participating teams.');
        const teams = policy.validateKitTeams(ids.map(id => ({id,players:snapshots[id].kitNumbers})), {referee:true,requireNumbered:true});
        const {sheetId} = require('./matchPlayerNumbers.cjs');
        const numberScope = {environment:'official',venueId,seasonId};
        const id = sheetId(numberScope,live.fixtureId), ref = db.doc(`matchNumberSheets/${id}`);
        const oldSheet = await tx.get(ref), revision = Number(oldSheet.data()?.revision || 0) + 1;
        const sheet = {scope:numberScope,matchKey:live.fixtureId,teams,rosterSignature:policy.kitRosterSignature(teams),revision,verifiedAtMs:now,verifiedByUid:user.uid};
        tx.set(ref,sheet);tx.set(ref.collection('revisions').doc(String(revision)),sheet);
        patch.confirmedLineupSnapshot = Object.fromEntries(ids.map(teamId => [teamId,{...snapshots[teamId],kitVerification:{sheetId:id,revision,verifiedAtMs:now}}]));
        patch.confirmedLineupsByMatchNo = {...(patch.confirmedLineupsByMatchNo || live.confirmedLineupsByMatchNo || {}),[live.currentMatchNo || 1]:patch.confirmedLineupSnapshot};
      }
      write({...patch, boothLastSeq: body.seq});
      return {ack: body.seq};
    }
    if (op === 'cancel') {
      if (!operator || !live.awaitingKitVerification || live.currentEvents?.length) throw denied('Only an official can cancel before the match starts.');
      const liveMatches = {...season.liveMatches}; delete liveMatches[live.fixtureId];
      tx.update(venueRef, {'league.activeSeason.liveMatches':liveMatches,updatedAt:FieldValue.serverTimestamp()});
      tx.delete(liveRef);log('match_cancelled','The referee cancelled the start before kit confirmation. No result was recorded.');
      return {cancelled:true};
    }
    if (op === 'finish') {
      const {completeBoothSeason} = await import('./fieldBoothShared/complete.mjs');
      const summary = body.summary || {};
      if (![summary.goalsA, summary.goalsB].every(n => Number.isInteger(n) && n >= 0 && n <= 999)) throw denied('Check the final score.');
      const completed = completeBoothSeason({season, fixtureId: live.fixtureId, summary,
        currentEvents: live.currentEvents || [], confirmedLineupSnapshot: live.confirmedLineupSnapshot || null,
        lineupTimeline: live.lineupTimeline || [], uid: user.uid,
        playedSeconds: Math.max(0, Number(live.matchSeconds) - Number(live.secondsLeft))});
      tx.update(venueRef, {'league.activeSeason': completed.season, updatedAt: FieldValue.serverTimestamp()});
      write({status: 'completed', running: false, timeUp: true, isFinished: true,
        finalSummary: summary, boothGuest: null, boothInvite: null, boothInviteId: null, completedAtMs: now, completedByUid:user.uid});
      log('match_completed', `${completed.result.teamAName} ${summary.goalsA}–${summary.goalsB} ${completed.result.teamBName}; recorded by ${profile.name}.`);
      return {completed: true};
    }
    throw denied('Unknown referee action.');
  });
}
exports.operate = operate;
exports.fieldRefereeBooth = onRequest({region: 'us-central1', invoker: 'public', cors: true}, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error: 'Use POST.'});
  try {
    const bearer = String(req.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
    if (!bearer) throw denied('Sign in with your own account.');
    const user = await getAuth().verifyIdToken(bearer, true);
    if (!user.email_verified || user.cameraSession || user.firebase?.sign_in_provider === 'anonymous') throw denied('Use your own verified account.');
    return res.json(await operate({db: getFirestore(), user, body: req.body || {}}));
  } catch (error) {
    console.error('[Field referee booth]', error.status || 500, error.message);
    return res.status(error.status || 400).json({error: error.message || 'The referee action could not be completed.'});
  }
});
