import test from 'node:test';import assert from 'node:assert/strict';
import {fieldFormationWeek} from '../src/core/fieldFormationWeek.mjs';
import {buildFormationDecorations} from '../src/core/matchDayFormationRatings.js';
const end=Date.parse('2026-11-01T20:00:00+02:00');
const fixtures=[{id:'old',matchDayId:'w1',clubAId:'club',clubBId:'other',status:'completed'},{id:'next',matchDayId:'w2',clubAId:'club',clubBId:'other',status:'scheduled'}];
const goal={id:'goal',fixtureId:'old',matchNo:1,type:'goal',teamId:'club',scorer:'Alex',assist:'Bea'};
const old={fixtureId:'old',matchNo:1,status:'completed',teamAId:'club',teamBId:'other',goalsA:1,goalsB:0,completedAtMs:end,events:[goal]};
const base={id:'season',fixtures,matchDays:[{id:'w1',dateLocal:'2026-11-01',status:'completed'},{id:'w2',dateLocal:'2026-11-08',status:'scheduled'}],results:[old],allEvents:[goal]};
const run=(season=base,now=end+3600000)=>fieldFormationWeek({season,teamId:'club',now});
test('ending a match day retains the dated performance for forty-eight hours',()=>{
 const before=run();const after=run({...base,results:[],allEvents:[],matchDayHistory:[{id:'w1',scheduledMatchDayId:'w1',endedAtMs:end,results:[old],allEvents:[goal]}]});
 assert.equal(after.matchDayId,'w1');assert.deepEqual(after.results,before.results);assert.equal(after.events.length,1);assert.equal(after.isRecap,true);
});
test('the recap clears automatically after the retention window',()=>{const value=run(base,end+48*3600000);assert.equal(value.matchDayId,'w2');assert.deepEqual(value.results,[]);assert.deepEqual(value.events,[]);});
test('the next match day begins unrated, with no old goals or assists',()=>{
 const now=Date.parse('2026-11-08T10:00:00+02:00'),value=run(base,now);const decor=buildFormationDecorations({teamId:'club',players:['Alex','Bea'],events:value.events,results:value.results});
 assert.equal(decor.Alex.rating,null);assert.equal(decor.Alex.icons.goals,0);assert.equal(decor.Bea.icons.assists,0);
});
test('new-week results and goals never include the previous match day',()=>{
 const newGoal={...goal,id:'new',fixtureId:'next',matchNo:2,assist:''},newResult={...old,fixtureId:'next',matchNo:2,completedAtMs:end+7*86400000,events:[newGoal]};
 const value=run({...base,results:[old,newResult],allEvents:[goal,newGoal]},newResult.completedAtMs+1000);assert.equal(value.matchDayId,'w2');assert.equal(value.events.length,1);assert.equal(value.events[0].id,'new');assert.equal(value.results.length,1);
});
test('starting a future fixture early immediately clears the prior recap from its lineup',()=>{
 const value=run({...base,liveMatches:{next:{id:'next',status:'live'}}});assert.equal(value.matchDayId,'w2');assert.equal(value.results.length,0);assert.equal(value.events.length,0);
});
test('events without a unique match-day reference are omitted instead of leaking across weeks',()=>{
 const next={...old,fixtureId:'next',matchNo:1,completedAtMs:end+7*86400000};const value=run({...base,results:[old,next],allEvents:[{id:'unknown',matchNo:1,type:'goal',scorer:'Alex'}]},next.completedAtMs+1000);assert.equal(value.events.some(e=>e.id==='unknown'),false);
});
test('a team with no played match day is blank',()=>{const value=run({...base,results:[],allEvents:[]});assert.equal(value.results.length,0);assert.equal(value.events.length,0);});

test('late administrative closure does not resurrect expired performance',()=>{const value=run({...base,matchDayHistory:[{id:'w1',endedAtMs:end+5*86400000,results:[old]}]},end+5*86400000);assert.equal(value.results.length,0);});
