const {test} = require("node:test");
const assert = require("node:assert/strict");
const {manageOrganizationArchive} = require("../functions/organizationArchive.cjs");
const admin = {uid: "platform", email_verified: true, email: "nkululekolerato@gmail.com"};
const make = (kind, data = {}, related = {}) => {
  const id = "example";
  const root = kind === "field" ? "leagueVenues" : "clubs";
  const path = `${root}/${id}`;
  const rows = {[path]: {name: "Example", status: "active", ...data}, ...related};
  const audit = [];
  const ref = path => ({
    path, doc: id => ref(`${path}/${id || "audit-id"}`),
    collection: id => ref(`${path}/${id}`),
    limit() { return {...this, asQuery: true}; },
    listCollections: async () => [...new Set(Object.keys(rows)
      .filter(key => key.startsWith(path + "/"))
      .map(key => key.slice(path.length + 1).split("/")[0]))].map(id => ({
        ...ref(`${path}/${id}`), id, listDocuments: async () => Object.keys(rows)
          .filter(key => key.startsWith(`${path}/${id}/`)),
      })),
    where: (field, op, value) => ({...ref(path), field, value, limit() {return this;}}),
  });
  const db = {doc: ref, collection: ref, runTransaction: async fn => {
    const edits = [];
    const result = await fn({
      get: async r => {
        if (!r.field && !r.asQuery) return {exists: r.path in rows, data: () => rows[r.path]};
        const docs = Object.entries(rows).filter(([p, d]) =>
          p.startsWith(r.path + "/") && (!r.field || d[r.field] === r.value)).map(([path,d]) =>
            ({id: path.split("/").at(-1), ref: ref(path), data:()=>d}));
        return {docs, empty: !docs.length};
      },
      delete: r => edits.push(() => delete rows[r.path]),
      update: (r, patch) => edits.push(() => Object.assign(rows[r.path], patch)),
      create: (r, record) => edits.push(() => audit.push([r.path, record])),
    });
    for (const edit of edits) edit();
    return result;
  }};
  return {rows, path, audit, call: (body = {}, user = admin) => manageOrganizationArchive({
    body: {kind, id, action:"organizationArchive", confirmation:"ARCHIVE example", reason:"Duplicate test listing", ...body},
    user, db, stamp: () => 123, fail: (message, status) => {throw Object.assign(new Error(message), {status});},
  })};
};

test("a verified platform admin can archive and restore a Field without touching its records", async () => {
  const f = make("field", {visibility: {listed:true, other:true}, league:{pastSeasons:["a"]}});
  await f.call();
  assert.equal(f.rows[f.path].visibility.listed, false);
  assert.equal(f.rows[f.path].deleted, true);
  assert.deepEqual(f.rows[f.path].league, {pastSeasons:["a"]});
  await f.call();
  assert.equal(f.audit.length, 1);
  await f.call({action:"organizationRestore", confirmation:"RESTORE example"});
  assert.deepEqual(f.rows[f.path].visibility, {listed:true, other:true});
  assert.deepEqual(f.audit.map(([, record]) => record.action), ["archive", "restore"]);
});

test("an ordinary owner, unverified admin or camera session cannot archive", async () => {
  const f = make("club", {ownerUid:"owner"});
  for (const user of [{...admin, uid:"owner", email:"owner@example.com"},
    {...admin, email_verified:false}, {...admin, cameraSession:true}]) {
    await assert.rejects(f.call({}, user), {status:403});
  }
  await assert.rejects(f.call({confirmation:"ARCHIVE other"}), /Type ARCHIVE example/);
  assert.equal(f.audit.length, 0);
  assert.equal(f.rows[f.path].status, "active");
});

test("a live Club or linked Club cannot be archived", async () => {
  const club = make("club", {}, {"clubs/example/state/main":{state:{seasons:[{liveMatchDraft:{status:"running"}}]}}});
  await assert.rejects(club.call(), /live Club match/);
  const linked = make("club", {}, {"clubFieldMemberships/example":{status:"active"}});
  await assert.rejects(linked.call(), /active Field membership/);
  assert.equal(club.audit.length + linked.audit.length, 0);
});

test("live Field fixtures, published seasons and active memberships block archiving", async () => {
  const field = make("field", {league:{activeSeason:{id:"season"}}}, {
    "leagueVenues/example/seasons/season/matches/fixture":{status:"live"},
  });
  await assert.rejects(field.call(), /live Field match/);
  const published = make("field", {league:{activeSeason:{id:"season", status:"active", schedulePublishedAtMs:123}}});
  await assert.rejects(published.call(), /published Field season/);
  const linked = make("field", {}, {"clubFieldMemberships/club":{venueId:"example",status:"active"}});
  await assert.rejects(linked.call(), /active Club memberships/);
});

test("archive is reversible for an ordinary Club, but not available for company Clubs", async () => {
  const club = make("club");
  await club.call();
  await club.call({action:"organizationRestore", confirmation:"RESTORE example"});
  assert.equal(club.rows[club.path].status, "active");
  await assert.rejects(make("club", {clubType:"company"}).call(), /protected Club/);
});

test("permanent deletion requires a verified admin, 3333 and an archived Field", async () => {
  const f = make("field", {ownerUid: "creator"}, {
    "leagueVenues/example/staff/creator": {isCreator: true},
  });
  const body = {action:"organizationDelete", confirmation:"3333"};
  await assert.rejects(f.call(body), /Archive this Field/);
  await f.call();
  await assert.rejects(f.call({...body, confirmation:"1234"}), /Incorrect confirmation code/);
  await assert.rejects(f.call(body, {...admin, email_verified: false}), {status:403});
  assert.equal(f.rows[f.path].deleted, true);
  await f.call(body);
  assert.equal(f.rows[f.path], undefined);
  assert.equal(f.rows["leagueVenues/example/staff/creator"], undefined);
  assert.equal(f.audit.at(-1)[0], "deletedFieldIds/example");
});

test("permanent deletion preserves Fields with related records", async () => {
  const data = {deleted: true, status:"deleted", visibility:{listed:false}};
  const body = {action:"organizationDelete", confirmation:"3333"};
  for (const f of [
    make("field", {...data, league:{activeSeason:{id:"season"}}}),
    make("field", data, {"leagueVenues/example/actionLog/entry":{}}),
    make("field", data, {"leagueClubBookings/booking":{venueId:"example"}}),
    make("field", data, {"leagueVenues/example/staff/other":{isCreator:false}}),
  ]) {
    await assert.rejects(f.call(body), /must stay archived/);
    assert.ok(f.rows[f.path]);
    assert.equal(f.audit.length, 0);
  }
});
