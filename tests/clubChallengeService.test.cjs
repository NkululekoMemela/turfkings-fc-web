"use strict";

const {test} = require("node:test");
const assert = require("node:assert/strict");
const {COLLECTION, sendClubChallenge, instigateClubChallenge, respondToClubChallenge,
  updateChallengeTeam, operateChallenge, exhibitionOverview, bookExhibition, reviseClubChallenge, manageExhibitionBookings, saveExhibitionLineup, getExhibitionMatchday, challengeChat, changeExhibitionKit, expireExhibitionCancellations, watchExhibition, isClubChallengeCaptain, listChallengeClubs} =
  require("../functions/clubChallengeService.cjs");

const captain = (uid) => ({uid, email: `${uid}@example.test`, email_verified: true});
const home = captain("home-captain");
const away = captain("away-captain");
const terms = {
  homeClubId: "home", awayClubId: "away", format: "7v7",
  proposedDate: "2026-11-15", proposedKickoff: "18:00", venue: "Wynberg", clubTotalCents: 220000, homeColour: "#0000ff", awayColour: "#ff0000",
};
const now = Date.parse("2026-11-14T17:00:00Z");

function setup() {
  const records = new Map([
    ["clubs/home", {name: "Home Club", captainEmail: home.email}],
    ["clubs/away", {name: "Away Club", adminEmails: ["admin@example.test"]}],
    ["clubStateOperators/away/users/away-captain", {memberId: "member"}],
    ["clubs/away/members/member", {uid: away.uid, email: away.email, status: "active", role: "captain", fullName: "Away Captain"}],
  ]);
  for (const id of ["home", "away"]) {
    for (let i = 0; i < 11; i++) records.set(`clubs/${id}/members/roster-${i}`, {
      status:"active", fullName:`Roster player ${i}`, uid:`${id}-roster-${i}`,
    });
  }
  const snapshot = (path) => ({id: path.split("/").at(-1), data: () => records.get(path)});
  const db = {
    doc: (path) => path,
    collection: (prefix) => ({
      doc: (id = `message-${records.size}`) => `${prefix}/${id}`,
      orderBy(field, direction) {return {prefix, field, direction, limit(count) {return {...this,count};}};},
      where(field, comparator, value) {
        return {prefix, field, comparator, value, limit(count) {return {...this, count};}};
      },
    }),
    runTransaction: (operation) => operation({
      get: async (path) => {
        if (typeof path === "string") return snapshot(path);
        const {prefix, field, comparator, value, count, direction} = path;
        const docs = [...records.keys()].filter((key) => {
          if (!key.startsWith(`${prefix}/`) || key.slice(prefix.length + 1).includes("/")) return false;
          const item = records.get(key)[field];
          return direction || (comparator === "array-contains" ? item?.includes(value) : item === value);
        });
        if (direction) docs.sort((a,b)=>(records.get(a)[field]-records.get(b)[field])*(direction==="desc"?-1:1));
        return {docs:docs.slice(0,count ?? docs.length).map(snapshot)};
      },
      create(path, data) {
        assert.equal(records.has(path), false);
        records.set(path, data);
      },
      update(path, patch) {
        const record = structuredClone(records.get(path));
        for (const [key, value] of Object.entries(patch)) {
          if (key.includes(".")) {
            const [parent, child] = key.split(".");
            record[parent] ||= {};
            record[parent][child] = value;
          } else record[key] = value;
        }
        records.set(path, record);
      },
    }),
  };
  return {
    records, db,
    send: (user = home, data = terms) => sendClubChallenge({db, user, data, now}),
    respond: (user, fixtureId, decision, responseTime = now, clubId = "away", revision = 1, colour = clubId === "home" ? terms.homeColour : terms.awayColour) =>
      respondToClubChallenge({db, user, data: {fixtureId, decision, clubId, revision, colour}, now: responseTime}),
  };
}

test("only verified Club captains can send and only the recipient captain can accept", async () => {
  const {send, respond, records} = setup();
  await assert.rejects(send(captain("admin"), {...terms, homeClubId: "away", awayClubId: "home"}), {code: "permission-denied"});
  await assert.rejects(send({...home, email_verified: false}), {code: "permission-denied"});
  const {fixtureId} = await send();
  await assert.rejects(respond(home, fixtureId, "accepted"), {code: "permission-denied"});
  await assert.rejects(respond(captain("admin"), fixtureId, "accepted"), {code: "permission-denied"});
  await assert.rejects(respond({...away, cameraSession: true}, fixtureId, "accepted"), {code: "permission-denied"});
  assert.deepEqual(await respond(away, fixtureId, "accepted"), {fixtureId, status: "accepted", acceptances: {home: true, away: true}});
  const record = records.get(`${COLLECTION}/${fixtureId}`);
  assert.deepEqual(record.participatingClubIds, ["away", "home"]);
  assert.equal(record.status, "accepted");
  assert.equal(record.kickoffMs, Date.parse("2026-11-15T16:00:00Z"));
  assert.equal(record.format, "7v7");
  assert.equal(record.home.name, "Home Club");
  assert.equal(record.away.name, "Away Club");
  assert.equal(record.home.email, undefined);
  assert.equal(record.away.email, undefined);
});

test("retries do not duplicate a fixture and a declined offer cannot be accepted", async () => {
  const {send, respond, records} = setup();
  const offer = await send();
  assert.deepEqual(await send(), offer);
  await assert.rejects(send(away, {...terms, homeClubId: "away", awayClubId: "home"}), {code: "already-exists"});
  await respond(away, offer.fixtureId, "declined");
  await assert.rejects(respond(away, offer.fixtureId, "accepted"), {code: "failed-precondition"});
  assert.deepEqual([...records.keys()].filter((path) => path.startsWith(COLLECTION)), [`${COLLECTION}/${offer.fixtureId}`]);
});

test("invalid dates and unavailable Clubs cannot create invitations; past offers cannot be accepted", async () => {
  const {send, respond, records} = setup();
  await assert.rejects(send(home, {...terms, proposedDate: "2027-02-30"}), {code: "invalid-argument"});
  const {fixtureId} = await send();
  await assert.rejects(respond(away, fixtureId, "accepted", Date.parse("2026-11-15T16:00:00Z")), {code: "failed-precondition"});
  records.set("clubs/away", {deleted: true});
  await assert.rejects(send(home, {...terms, proposedDate: "2026-11-16"}), {code: "not-found"});
});

test("each captain publishes only their own squad, with the format's starter count", async () => {
  const {send, respond, db, records} = setup();
  const {fixtureId} = await send(home, {...terms, format: "11v11"});
  await respond(away, fixtureId, "accepted");
  const players = Array.from({length: 15}, (_, i) => `Player ${i + 1}`);
  records.get(`${COLLECTION}/${fixtureId}`).bookings = {
    home: Object.fromEntries(players.map((name) => [name, {memberId: name, name}])),
    away: Object.fromEntries(players.map((name) => [name, {memberId: `Away ${name}`, name: `Away ${name}`}])),
  };
  const update = (user, clubId, squad) =>
    updateChallengeTeam({db, user, data: {clubId, fixtureId, memberIds: squad}, now});
  await assert.rejects(update(home, "away", players), {code: "permission-denied"});
  await assert.rejects(update(home, "home", players.slice(0, 10)), {code: "invalid-argument"});
  await update(home, "home", players);
  await assert.rejects(update(away, "away", players), {code: "invalid-argument"});
  await update(captain("admin"), "away", players.map((name) => `Away ${name}`));
  const {teams} = records.get(`${COLLECTION}/${fixtureId}`);
  assert.equal(teams.home.starters.length, 11);
  assert.equal(teams.home.substitutes.length, 4);
  assert.equal(teams.away.starters[0], "Away Player 1");
});

test("two phones share one match and only its current controller can change the score", async () => {
  const {send, respond, db, records} = setup();
  const {fixtureId} = await send();
  const read = () => records.get(`${COLLECTION}/${fixtureId}`);
  const firstPhone = "12345678-1234-1234-1234-123456789abc";
  const secondPhone = "12345678-1234-1234-1234-123456789def";
  const operate = (user, clubId, device, command, options = {}) =>
    operateChallenge({db, user, data: {clubId, fixtureId, device, command, revision: read().live?.revision, ...options}, now});
  await respond(away, fixtureId, "accepted");
  await assert.rejects(operate(home, "home", firstPhone, "start", {minutes: 20}), {code: "failed-precondition"});
  read().bookings = {};
  for (const [user, clubId] of [[home, "home"], [away, "away"]]) {
    const ids = Array.from({length: 7}, (_, i) => `${clubId} ${i + 1}`);
    read().bookings[clubId] = Object.fromEntries(ids.map((id) => [id, {name: id, memberId: id}]));
    await updateChallengeTeam({db, user, data: {clubId, fixtureId, memberIds: ids}, now});
  }
  await operate(home, "home", firstPhone, "start", {minutes: 20});
  await assert.rejects(operate(away, "away", secondPhone, "score", {side: "away", change: 1}), {code: "permission-denied"});
  await operate(home, "home", firstPhone, "score", {side: "home", change: 1});
  await assert.rejects(operate(home, "home", firstPhone, "score", {revision: 1, side: "home", change: 1}), {code: "failed-precondition"});
  await operate(away, "away", secondPhone, "requestControl");
  await operate(home, "home", firstPhone, "transferControl");
  await assert.rejects(operate(home, "home", firstPhone, "finish"), {code: "permission-denied"});
  await operate(away, "away", secondPhone, "finish");
  assert.equal(read().status, "completed");
  assert.equal(read().live.home, 1);
  assert.equal(read().live.away, 0);
});

test("exhibition booking is members-only, capped at 15, and sums to the Club total", async () => {
  const {db, records, send, respond} = setup();
  const {fixtureId} = await send();
  const signup = (user, clubId, expectedPriceCents) => bookExhibition({
    db, user, data: {fixtureId, clubId, expectedPriceCents}, now,
  });
  const getOverview = (user, clubId = "home") =>
    exhibitionOverview({db, user, data: {clubId}, now});
  const players = Array.from({length: 16}, (_, index) => captain(`player-${index}`));
  players.forEach((player) => records.set(`clubs/home/members/${player.uid}`, {
    uid: player.uid, email: player.email, status: "active", fullName: player.uid,
  }));
  assert.equal((await getOverview(players[0])).fixtures.length, 0);
  await assert.rejects(signup(players[0], "home", 14667), {code: "failed-precondition"});
  await respond(away, fixtureId, "accepted");
  await assert.rejects(getOverview(captain("outsider")), {code: "permission-denied"});
  await assert.rejects(signup(players[0], "away", 14667), {code: "permission-denied"});
  let sum = 0;
  for (const player of players.slice(0, 15)) {
    const {fixtures: [view], canManage} = await getOverview(player);
    assert.equal(canManage, false);
    assert.deepEqual(view.signedMemberIds, []);
    const booking = await signup(player, "home", view.priceCents);
    assert.equal((await signup(player, "home", view.priceCents)).priceCents, booking.priceCents);
    sum += booking.priceCents;
  }
  assert.equal(sum, 220000);
  await assert.rejects(signup(players[15], "home", 14666), {code: "failed-precondition"});
  const {fixtures: [manager]} = await getOverview(home);
  assert.equal(manager.count, 15);
  assert.equal(manager.signedMemberIds.length, 15);
  assert.equal(manager.readyCount, 12);
  assert.equal((await getOverview(away, "away")).fixtures[0].count, 0);
});

test("the FANM Club picker exposes active community Clubs only to the verified superuser", async () => {
  const admin = {...captain("platform"), email: "nkululekolerato@gmail.com"};
  const records = {
    zulu: {clubName: "Zulu FC", badgeUrl: "/zulu.png", captainEmail: "private@example.test"},
    alpha: {name: "Alpha FC", logoUrl: "/alpha.png", banking: {account: "private"}},
    company: {clubType: "company"},
    archived: {organizationArchive: {active: true}},
    deleted: {status: "deleted"},
  };
  let reads = 0;
  const db = {collection(name) {
    assert.equal(name, "clubs");
    reads++;
    return {get: async () => ({docs: Object.entries(records).map(([id, data]) => ({id, data: () => data}))})};
  }};
  await assert.rejects(listChallengeClubs({db, user: home}), {code: "permission-denied"});
  await assert.rejects(listChallengeClubs({db, user: {...admin, email_verified: false}}), {code: "permission-denied"});
  assert.equal(reads, 0);
  assert.deepEqual(await listChallengeClubs({db, user: admin}), {clubs: [
    {id: "alpha", name: "Alpha FC", logoUrl: "/alpha.png", coordinates: null},
    {id: "zulu", name: "Zulu FC", logoUrl: "/zulu.png", coordinates: null},
  ]});
});

test("only the verified superuser can instigate and both captains must accept", async () => {
  const {db, records, respond} = setup();
  const admin = {...captain("superuser"), email: "nkululekolerato@gmail.com"};
  const instigate = (user) => instigateClubChallenge({db, user, data: terms, now});
  await assert.rejects(instigate(home), {code: "permission-denied"});
  await assert.rejects(instigate({...admin, email_verified: false}), {code: "permission-denied"});
  const {fixtureId} = await instigate({...admin, email: "5asidesnearme@gmail.com"});
  assert.equal(records.get(`${COLLECTION}/${fixtureId}`).homeColour, null);
  assert.equal(records.get(`${COLLECTION}/${fixtureId}`).awayColour, null);
  await assert.rejects(respond(away, fixtureId, "accepted", now, "home"), {code: "permission-denied"});
  assert.equal((await respond(home, fixtureId, "accepted", now, "home")).status, "pending");
  assert.equal((await respond(home, fixtureId, "accepted", now, "home")).status, "pending");
  const {fixtures} = await exhibitionOverview({db, user: home, data: {clubId: "home"}, now});
  assert.equal(fixtures.length, 0);
  assert.equal((await respond(away, fixtureId, "accepted")).status, "accepted");
  assert.deepEqual(records.get(`${COLLECTION}/${fixtureId}`).acceptances, {home: true, away: true});
});

test("a venue and kit counterproposal needs fresh agreement from the other captain", async () => {
  const {db, send, respond, records} = setup();
  const {fixtureId} = await send();
  const proposed = {clubId: "away", fixtureId, revision: 1, proposedDate: terms.proposedDate,
    proposedKickoff: "19:00", venue: "New venue", homeColour: "#0000ff", awayColour: "#00ff00"};
  await assert.rejects(reviseClubChallenge({db, user: away, data: {...proposed, awayColour: proposed.homeColour}, now}), {code: "invalid-argument"});
  await reviseClubChallenge({db, user: away, data: proposed, now});
  await assert.rejects(respond(home, fixtureId, "accepted", now, "home", 1), {code: "failed-precondition"});
  const result = await respond(home, fixtureId, "accepted", now, "home", 2);
  assert.equal(result.status, "accepted");
  assert.equal(records.get(`${COLLECTION}/${fixtureId}`).venue, "New venue");
  assert.equal(records.get(`${COLLECTION}/${fixtureId}`).awayColour, "#00ff00");
});

test("bulk cash signup is scoped to a Club, reconciles self signups, and survives withdrawal", async () => {
  const {db, records, send, respond} = setup();
  const {fixtureId} = await send();
  await respond(away, fixtureId, "accepted");
  const player = captain("player");
  records.set("clubs/away/members/a", {uid: player.uid, status: "active", fullName: "Player One"});
  records.set("clubs/away/members/b", {status: "active", fullName: "Player Two"});
  const book = (user, extra = {}) => manageExhibitionBookings({db, user, now, data: {clubId: "away", fixtureId, ...extra}});
  await assert.rejects(book(home, {memberIds: ["a"]}), {code: "permission-denied"});
  assert.equal((await book(away)).players.length, 14);
  await book(away, {memberIds: ["a", "b"], cashPaid: true});
  await book(away, {memberIds: ["a"], cashPaid: true});
  await bookExhibition({db, user: player, now, data: {clubId: "away", fixtureId, expectedPriceCents: 14667}});
  const record = () => records.get(`${COLLECTION}/${fixtureId}`);
  assert.equal(Object.keys(record().bookings.away).length, 2);
  const withdraw = (user) => reviseClubChallenge({db, user, now, data: {clubId: "home", fixtureId, withdraw: true}});
  await assert.rejects(withdraw(player), {code: "permission-denied"});
  await assert.rejects(withdraw(home), /cancellation reason/);
  const cancel = (user, clubId, cancellationAction, extra = {}) =>
    reviseClubChallenge({db, user, now, data: {clubId, fixtureId, cancellationAction, ...extra}});
  await cancel(home, "home", "request", {reason: "Pitch unavailable"});
  assert.equal(record().status, "accepted");
  await assert.rejects(cancel(home, "home", "acknowledge"), {code:"permission-denied"});
  await cancel(away, "away", "suggest", {suggestion:"Use the second pitch"});
  assert.equal(record().cancellation.suggestion, "Use the second pitch");
  await cancel(away, "away", "acknowledge");
  assert.equal(record().status, "withdrawn");
  assert.equal(record().bookings.away["member:a"].cashPaidAtMs, now);
  assert.deepEqual((await exhibitionOverview({db, user: away, data: {clubId: "away"}, now})).fixtures, []);
  await assert.rejects(book(away, {memberIds: ["a"]}), {code: "failed-precondition"});
  const notices = (await exhibitionOverview({db, user: player, data: {clubId: "away"}, now})).playerNotices;
  assert.deepEqual(notices.map(({type}) => type), ["cancelled"]);
  await cancel(home, "home", "restore");
  assert.equal(record().status, "withdrawn");
  await cancel(away, "away", "restore");
  assert.equal(record().status, "accepted");
  assert.equal(record().bookings.away["member:a"].cashPaidAtMs, now);
});

test("exhibition lineups are fixture-scoped and the 11-a-side booth plays two 45-minute halves", async () => {
  const {db, send, respond, records} = setup();
  const {fixtureId} = await send(home, {...terms, format: "11v11"});
  await respond(away, fixtureId, "accepted");
  const doc = () => records.get(`${COLLECTION}/${fixtureId}`);
  const names = Array.from({length:11}, (_, i) => `Player ${i+1}`);
  doc().teams = {home: {starters: names, substitutes: [], memberIds: names}, away: {starters: names, substitutes: []}};
  const lineup = {clubId:"home", fixtureId, teamId:"home", formationId:"4-3-3",
    positions:Object.fromEntries(names.map((name, i) => [`p${i+1}`, name]))};
  const save = (user, data) => saveExhibitionLineup({db, user, data, now});
  await assert.rejects(save(home, {...lineup, teamId:"away"}), {code:"permission-denied"});
  await assert.rejects(save(home, {...lineup, formationId:"fake"}), {code:"invalid-argument"});
  await save(home,lineup);
  await assert.rejects(getExhibitionMatchday({db,user:captain("outsider"),data:{clubId:"home",fixtureId}}), {code:"permission-denied"});
  const opponent = await getExhibitionMatchday({db,user:away,data:{clubId:"away",fixtureId}});
  assert.equal(opponent.lineups.home.positions.p11, names[10]);
  assert.equal(opponent.teams.home.memberIds, undefined);
  const device = "12345678-1234-1234-1234-123456789abc";
  const act = (command, at, options = {}) => operateChallenge({db,user:home,now:at,
    data:{clubId:"home", fixtureId, device, command, revision:doc().live?.revision,...options}});
  await act("start", now, {minutes:20});
  assert.equal(doc().live.endsAtMs, now + 45 * 60000);
  assert.equal(doc().startingLineups.home.length, 11);
  await assert.rejects(act("halftime", now), {code:"invalid-argument"});
  await act("halftime", now + 45 * 60000);
  assert.equal(doc().live.phase, "halftime");
  assert.equal(doc().live.endsAtMs, null);
  await act("secondHalf", now + 60 * 60000);
  assert.equal(doc().live.endsAtMs, now + 105 * 60000);
  await act("score", now + 65 * 60000,{side:"home",change:1,scorer:names[0]});
  await act("finish",now + 105 * 60000);
  const homeResult = await exhibitionOverview({db,user:home,data:{clubId:"home"},now});
  const awayResult = await exhibitionOverview({db,user:away,data:{clubId:"away"},now});
  assert.deepEqual(homeResult.mediaFixtures,awayResult.mediaFixtures);
  assert.equal(homeResult.mediaFixtures[0].homeScore,1);
});

test("the exhibition chat rejects both pending invitations and unrelated accounts", async () => {
  const {db, send, respond} = setup();
  const {fixtureId} = await send();
  const chat = (user, clubId) => challengeChat({db,user,data:{clubId,fixtureId},now});
  await assert.rejects(chat(home,"home"), {code:"failed-precondition"});
  await respond(away,fixtureId,"accepted");
  await assert.rejects(chat(captain("outsider"),"home"), {code:"permission-denied"});
});

test("exhibition kit changes update only the requesting Club silently and reject clashes", async () => {
  const {send, respond, db, records} = setup();
  const {fixtureId} = await send();
  await respond(away, fixtureId, "accepted");
  const path = `${COLLECTION}/${fixtureId}`;
  const change = (user, clubId, colour) =>
    changeExhibitionKit({db, user, data: {clubId, fixtureId, colour}, now});
  await assert.rejects(change(home, "away", "#f8fafc"), {code: "permission-denied"});
  await assert.rejects(change(home, "home", "#f97316"), /too similar/);
  assert.equal(records.get(path).homeColour, "#0000ff");
  const result = await change(home, "home", "#f8fafc");
  assert.deepEqual(result, {colour: "#f8fafc"});
  assert.equal(records.get(path).homeColour, "#f8fafc");
  const opponentView = await getExhibitionMatchday({db, user: away, data: {clubId: "away", fixtureId}});
  assert.equal(opponentView.homeColour, "#f8fafc");
  assert.equal(records.get(path).awayColour, "#ff0000");
  assert.equal(records.has(`${path}/chat/kit-1`), false);
  await assert.rejects(change(away, "away", "#f8fafc"), /too similar/);
  assert.equal((await change(home, "home", "#f8fafc")).unchanged, true);
  assert.equal(records.has(`${path}/chat/kit-2`), false);
  await change(away, "away", "#facc15");
  await assert.rejects(change(home, "home", "#f97316"), /too similar/);
  records.get(path).status = "live";
  await assert.rejects(change(home, "home", "#22c55e"), /before kickoff/);
});

test("accepted booking notices are fixture scoped and absent before acceptance", async () => {
  const {db, send, respond, records} = setup();
  const player = captain("player");
  records.set("clubs/away/members/notice-player", {uid:player.uid,status:"active",fullName:"Player"});
  const {fixtureId} = await send();
  const overview = () => exhibitionOverview({db,user:player,data:{clubId:"away"},now});
  assert.deepEqual((await overview()).playerNotices, []);
  await respond(away, fixtureId, "accepted");
  await respond(away, fixtureId, "accepted", now+5);
  const [notice, duplicate] = (await overview()).playerNotices;
  assert.equal(duplicate, undefined);
  assert.deepEqual([notice.type,notice.fixtureId,notice.at,notice.opponentName], ["accepted",fixtureId,now,"Home Club"]);
});

test("cancellation deadlines allow twelve hours or protect four hours before kickoff", async () => {
  const {db, send, respond, records} = setup();
  const {fixtureId} = await send();
  await respond(away, fixtureId, "accepted");
  const path = `${COLLECTION}/${fixtureId}`, match = () => records.get(path);
  const action = (cancellationAction, at) => reviseClubChallenge({db,user:home,now:at,
    data:{clubId:"home",fixtureId,cancellationAction,reason:"Venue closed"}});
  await assert.rejects(action("force", now), /only available close/);
  await action("request", now);
  assert.equal(match().cancellationDueMs, now + 12 * 3600000);
  await action("keep", now+60000);
  const kickoff = match().kickoffMs;
  await action("request", kickoff - 5 * 3600000);
  const deadline = kickoff - 4 * 3600000 - 60000;
  assert.equal(match().cancellationDueMs, deadline);
  const originalCollection = db.collection;
  db.collection = () => ({where(){return this;},limit(){return this;},async get(){return {docs:[{ref:path}]};}});
  await expireExhibitionCancellations(db, deadline - 1);
  assert.equal(match().status, "accepted");
  await expireExhibitionCancellations(db, deadline);
  assert.equal(match().status, "withdrawn");
  assert.equal(match().cancellation.outcome, "timed_out");
  db.collection = originalCollection;
  const second = await send(home, {...terms, proposedKickoff:"19:00"});
  await respond(away, second.fixtureId, "accepted");
  await reviseClubChallenge({db,user:home,now:kickoff-3600000,data:{clubId:"home",fixtureId:second.fixtureId,
    cancellationAction:"force",reason:"Pitch unsafe"}});
  assert.equal(records.get(`${COLLECTION}/${second.fixtureId}`).status,"withdrawn");
});

test("FANM 11-a-side offers offer an editable quote and retain the premium package for both captains", async () => {
  const {db, records} = setup();
  const user = {...captain("superuser"), email: "nkululekolerato@gmail.com"};
  const data = {...terms, format:"11v11"};
  await assert.rejects(instigateClubChallenge({db,user,now,data:{...data,clubTotalCents:0}}), /quote per Club/);
  const {fixtureId} = await instigateClubChallenge({db,user,now,data:{...data,clubTotalCents:195000}});
  const fallback = await instigateClubChallenge({db,user,now,data:{...data,proposedDate:"2026-11-16",clubTotalCents:undefined}});
  assert.equal(records.get(`${COLLECTION}/${fallback.fixtureId}`).clubTotalCents,220000);
  const match = records.get(`${COLLECTION}/${fixtureId}`);
  assert.equal(match.clubTotalCents, 195000);
  assert.deepEqual(match.acceptances,{home:false,away:false});
  assert.deepEqual(match.hostedPackage,{rosterPerClub:15,waterPerClub:24,waterMl:500,fieldBooking:true,referee:true,cameraOperator:true,numberedBibs:true});
});

test("exhibition starts through lineup verification and the other captain can recover the same booth", async () => {
  const {db,send,respond,records}=setup();
  const {fixtureId}=await send(home,{...terms,format:"11v11"});
  await respond(away,fixtureId,"accepted");
  const path=`${COLLECTION}/${fixtureId}`, match=()=>records.get(path);
  const names=Array.from({length:11},(_,i)=>`Player ${i+1}`);
  match().teams={home:{starters:names,substitutes:[]},away:{starters:names,substitutes:[]}};
  const device="12345678-1234-1234-1234-123456789abc", other="12345678-1234-1234-1234-123456789def";
  const act=(command, options={}, at=now, user=home, clubId="home", phone=device)=>operateChallenge({
    db,user,now:at,data:{clubId,fixtureId,device:phone,revision:match().live?.revision,command,...options},
  });
  await act("start",{minutes:2,verifyFirst:true});
  assert.equal(match().live.halfMs,2700000);
  assert.equal(match().live.endsAtMs,null);
  const event={type:"goal",id:"e",teamId:"home",scorer:"Player 1",timeSeconds:12};
  await assert.rejects(act("editEvent",{mode:"append",event}),/cannot be changed/);
  const positions=Object.fromEntries(names.map((name,i)=>[`p${i+1}`,name]));
  await act("confirmLineups",{snapshots:{home:{positions},away:{positions}}});
  await act("editEvent",{mode:"append",event},now+12000);
  assert.equal(match().live.home,1);
  const matrix=await exhibitionOverview({db,user:away,data:{clubId:"away"},now});
  assert.equal(matrix.fixtures[0].status,"live");
  assert.equal(matrix.fixtures[0].canBook,false);
  const publicMatch=await watchExhibition({db,data:{clubId:"away",fixtureId},now});
  assert.equal(publicMatch.live.events[0].scorer,undefined);
  assert.equal(publicMatch.live.controller,undefined);
  assert.equal(await watchExhibition({db,data:{clubId:"away",fixtureId:"f".repeat(64)},now}),null);
  await act("requestControl",{},now+15000,away,"away",other);
  await assert.rejects(act("takeover",{},now+29999,away,"away",other),/not ready/);
  await act("rejectControl",{},now+20000);
  await assert.rejects(act("takeover",{},now+40000,away,"away",other),/not ready/);
  await act("requestControl",{},now+40000,away,"away",other);
  await act("takeover",{},now+55000,away,"away",other);
  await assert.rejects(act("finish",{},now+56000),{code:"permission-denied"});
  await act("editEvent",{mode:"replace",eventId:"e",event:{...event,scorer:"Player 2"}},now+56000,away,"away",other);
  assert.equal(match().live.events[0].scorer,"Player 2");
  assert.equal(match().live.endsAtMs,now+2700000);
  await act("finish",{},now+57000,away,"away",other);
  assert.equal(match().status,"completed");
});

test("postponement preserves bookings and the signup column survives scheduled kickoff",async()=>{
  const {db,send,respond,records}=setup();
  const {fixtureId}=await send();
  await respond(away,fixtureId,"accepted");
  const path=`${COLLECTION}/${fixtureId}`, match=()=>records.get(path);
  const original=match().kickoffMs;
  const matrix=at=>exhibitionOverview({db,user:away,data:{clubId:"away"},now:at});
  assert.equal((await matrix(original+60000)).fixtures[0].bookingOpen,false);
  match().bookings={away:{player:{memberId:"member",priceCents:14667,cashPaidAtMs:now}}};
  match().teams={away:{starters:["Player"],substitutes:[]}};
  const revise=(user,clubId,postponementAction,options={})=>reviseClubChallenge({db,user,now:now+1,
    data:{clubId,fixtureId,postponementAction,...options}});
  const {postponement}=await revise(home,"home","request",{reason:"Pitch closed",proposedDate:"2026-11-16",proposedKickoff:"19:00"});
  assert.equal(match().kickoffMs,original);
  await assert.rejects(revise(home,"home","agree",{requestedAtMs:postponement.requestedAtMs}),/latest/);
  await revise(away,"away","agree",{requestedAtMs:postponement.requestedAtMs});
  assert.equal(match().fixtureId,fixtureId);
  assert.equal(match().kickoffMs,Date.parse("2026-11-16T19:00:00+02:00"));
  assert.equal(match().bookings.away.player.cashPaidAtMs,now);
  assert.deepEqual(match().teams.away.starters,["Player"]);
  assert.equal((await matrix(now+2)).playerNotices[0].type,"postponed");
});

test("exhibition chat attaches only fixture videos and keeps account and reaction identities private",async()=>{
  const {db,send,respond,records}=setup();
  const {fixtureId}=await send();
  await respond(away,fixtureId,"accepted");
  const fixture=records.get(`${COLLECTION}/${fixtureId}`);
  const act=(user,clubId,data={})=>challengeChat({db,user,now,data:{clubId,fixtureId,...data}});
  const attachment={sourceClubId:"home",bucket:"raw",clipId:"goal"};
  await assert.rejects(act(home,"home",{attachment}),/exhibition/);
  fixture.status="live";
  records.set(`clubs/home/video_highlights/${fixtureId}/raw/goal`,{title:"Winner",videoUrl:"https://example.test/winner.mp4"});
  await assert.rejects(act(away,"away",{attachment:{...attachment,sourceClubId:"other"}}),/exhibition/);
  await assert.rejects(act(away,"away",{attachment:{...attachment,clipId:"missing",url:"https://example.test/injected.mp4"}}),/no longer available/);
  await act(home,"home",{attachment:{...attachment,url:"https://example.test/injected.mp4"}});
  let [message]=(await act(away,"away")).messages;
  assert.deepEqual(message.attachment,{title:"Winner",url:"https://example.test/winner.mp4"});
  assert.equal(message.senderUid,undefined);
  assert.equal(message.mine,false);
  await act(away,"away",{message:"Great goal!",replyToId:message.id});
  await act(away,"away",{chatAction:"react",messageId:message.id,emoji:"⚽"});
  const messages=(await act(away,"away")).messages;
  assert.equal(messages.find(row=>row.body==="Great goal!").reply.id,message.id);
  message=messages.find(row=>row.id===message.id);
  assert.deepEqual(message.reactionCounts,{"⚽":1});
  assert.equal(message.myReaction,"⚽");
  assert.equal(message.reactions,undefined);
  await assert.rejects(act(away,"away",{chatAction:"delete",messageId:message.id}),{code:"permission-denied"});
  await act(home,"home",{chatAction:"delete",messageId:message.id});
  const deleted=(await act(away,"away")).messages.find(row=>row.id===message.id);
  assert.equal(deleted.deleted,true);
  assert.equal(deleted.attachment,null);
});

test("challenge push recipients must be captains who can respond to the invitation",async()=>{
 const {db}=setup();
 assert.equal(await isClubChallengeCaptain(db,"home",home),true);
 assert.equal(await isClubChallengeCaptain(db,"away",away),true);
 assert.equal(await isClubChallengeCaptain(db,"away",captain("admin")),false);
 assert.equal(await isClubChallengeCaptain(db,"home",{...home,email_verified:false}),false);
});
test("only the active exhibition referee can override the match kit, without changing squad kit",async()=>{
 const {db,send,respond,records}=setup();
 const {fixtureId}=await send();
 await respond(away,fixtureId,"accepted");
 const path=`${COLLECTION}/${fixtureId}`, match=()=>records.get(path);
 match().teams={home:{starters:[]},away:{starters:[]}};
 const device="12345678-1234-1234-1234-123456789abc";
 const act=(command,options={},user=home,clubId="home")=>operateChallenge({db,user,now,
  data:{clubId,fixtureId,device,revision:match().live?.revision,command,...options}});
 await act("start",{minutes:40,verifyFirst:true});
 await assert.rejects(act("matchColour",{teamId:"home",hex:"#ff0000"}),/too similar/);
 await assert.rejects(act("matchColour",{teamId:"home",hex:"#ffffff"},away,"away"),{code:"permission-denied"});
 await act("matchColour",{teamId:"home",hex:"#ffffff"});
 assert.equal(match().live.matchColours.home.teamColorHex,"#ffffff");
 assert.equal(match().homeColour,terms.homeColour);
 await act("matchColour",{reset:true});
 assert.deepEqual(match().live.matchColours,{});
});

test("a distant challenge requires acknowledgement and neither captain can declare the other kit", async () => {
  const {db, records, send, respond} = setup();
  records.set("clubs/home", {...records.get("clubs/home"), coordinates: {lat: -33.92, lng: 18.42}});
  records.set("clubs/away", {...records.get("clubs/away"), coordinates: {lat: -33.96, lng: 25.60}});
  await assert.rejects(send(home, terms), /km apart/);
  const {fixtureId} = await send(home, {...terms, distanceAcknowledged: true});
  const match = () => records.get(`${COLLECTION}/${fixtureId}`);
  assert.equal(match().homeColour, terms.homeColour);
  assert.equal(match().awayColour, null);
  await assert.rejects(respond(away, fixtureId, "accepted", now, "away", 1, terms.homeColour), /too similar/);
  await respond(away, fixtureId, "accepted", now, "away", 1, "");
  assert.equal(match().homeColour, terms.homeColour);
  assert.equal(match().awayColour, null);
  await changeExhibitionKit({db,user:away,data:{clubId:"away",fixtureId,colour:"#dc2626"},now});
  assert.equal(match().awayColour,"#dc2626");
});

test("challenges enforce both roster sizes for each format and recheck at acceptance", async () => {
  for (const size of [5, 6, 7, 11]) {
    const {records, send, respond} = setup();
    for (let i = size - 1; i < 11; i++) records.delete(`clubs/home/members/roster-${i}`);
    const proposal = {...terms, format: `${size}v${size}`};
    await assert.rejects(send(home, proposal), new RegExp(`requires at least ${size}`));
    records.set("clubs/home/members/replacement", {status:"active",fullName:"Replacement"});
    const {fixtureId} = await send(home, proposal);
    records.delete("clubs/home/members/replacement");
    await assert.rejects(respond(away, fixtureId, "accepted"), new RegExp(`requires at least ${size}`));
  }
});
