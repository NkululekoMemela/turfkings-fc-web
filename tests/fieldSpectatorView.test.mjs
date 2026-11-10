import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldSpectatorView,fieldSpectatorScore} from '../src/core/fieldSpectatorView.mjs';
const now=Date.parse('2026-11-03T12:00:00Z');
test('spectators see live ahead of results and fixtures',()=>{
 const live={status:'live',teamAId:'a',teamBId:'b',currentEvents:[{type:'goal',teamId:'a'},{type:'yellow_card',teamId:'b'}]};
 assert.equal(fieldSpectatorView({season:null,live,now}).kind,'live');
 assert.deepEqual(fieldSpectatorScore(live),{a:'a',b:'b',events:live.currentEvents,goalsA:1,goalsB:0});
});
test('recent result remains until the upcoming fixture is nearer',()=>{
 const season={results:[{fixtureId:'past',status:'completed',completedAtMs:now-3600000,goalsA:2,goalsB:1}],fixtures:[{id:'next',status:'scheduled',scheduledLocal:'2026-11-03T18:00:00'}]};
 assert.equal(fieldSpectatorView({season,now}).kind,'result');
 assert.equal(fieldSpectatorView({season,now:now+3*3600000}).kind,'upcoming');
 assert.equal(fieldSpectatorScore(season.results[0]).goalsA,2);
});
test('archived results and explicit timezone fixture fallback are supported',()=>{
 const result={fixtureId:'past',status:'completed'};
 const season={matchDayHistory:[{results:[result]}],fixtures:[{id:'past',scheduledLocal:'2026-11-03T11:00:00Z'},{id:'next',status:'scheduled',scheduledLocal:'2026-11-03T14:00:00Z'}]};
 assert.equal(fieldSpectatorView({season,now}).kind,'result');
 assert.equal(fieldSpectatorView({season:null,now}).kind,'empty');
 assert.equal(fieldSpectatorView({season:{fixtures:[{status:'scheduled',scheduledLocal:'invalid'}]},now}).kind,'empty');
});

test("an accepted exhibition stays selected after its scheduled kickoff while waiting for the referee", () => {
  const kickoffMs=Date.parse("2026-11-11T17:00:00Z");
  const fixture={status:"accepted",fixtureId:"exhibition",kickoffMs,teamAId:"home",teamBId:"away"};
  const open=live=>fieldSpectatorView({live,requestedFixtureId:"exhibition",now:kickoffMs+180000});
  assert.equal(open(fixture).kind,"upcoming");
  assert.equal(open(fixture).match.atMs,kickoffMs);
  assert.equal(open({...fixture,status:"live"}).kind,"live");
  assert.equal(open({...fixture,status:"completed"}).kind,"result");
  assert.equal(open({...fixture,status:"withdrawn"}).kind,"empty");
});
