import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleFieldMatchEvents} from '../src/core/fieldMatchFeed.mjs';
import {highlightFixtureDate,highlightFixtureOptions} from '../src/core/highlightFixtures.mjs';
test('defensive credit stays intact in source while public feed omits DB and clean sheets',()=>{
 const events=[{type:'goal'},{type:'defensive_block'},{type:'yellow_card'},{type:'clean_sheet'},{type:'injury'}];
 assert.deepEqual(visibleFieldMatchEvents(events).map(e=>e.type),['goal','yellow_card','injury']);
 assert.equal(events.length,5);
});
test('Firestore dates and serialised dates never leak Timestamp strings',()=>{
 const date=highlightFixtureDate({seconds:1793923200});
 assert.ok(date.includes('2026'));assert.equal(highlightFixtureDate({toDate:()=>new Date(1793923200000)}),date);
 assert.equal(highlightFixtureDate('Timestamp(seconds=1793923200, nanoseconds=0)'), '');
 assert.equal(highlightFixtureDate(null),'');
});
test('match folders retain actual scores and count only their own clips',()=>{
 const options=highlightFixtureOptions([{matchId:'a',teamAName:'A',teamBName:'B',createdAt:{seconds:1793923200}},{matchId:'b',teamAName:'C',teamBName:'D'}],[{matchId:'a',label:'A vs B',goalsA:0,goalsB:0}]);
 assert.equal(options.find(f=>f.matchId==='a').goalsA,0);assert.equal(options.find(f=>f.matchId==='a').clipCount,1);
 assert.equal(options.find(f=>f.matchId==='b').goalsA,undefined);
});
