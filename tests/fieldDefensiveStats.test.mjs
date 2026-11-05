import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldMatchStatEvents} from '../src/core/fieldDefensiveStats.mjs';
import {buildFormationDecorations} from '../src/core/matchDayFormationRatings.js';
const lineup=prefix=>({formationId:'2-0-2',positions:{p1:prefix+'F1',p2:prefix+'F2',p3:prefix+'D1',p4:prefix+'D2',p5:prefix+'GK'}});
const result=()=>({id:'m',matchNo:1,status:'completed',teamAId:'a',teamBId:'b',goalsA:0,goalsB:0,isDraw:true,gameFormat:'5_V_5',playedSeconds:600,confirmedLineupSnapshot:{a:lineup('A'),b:lineup('B')},events:[]});
const decor=(events,mode='FIELD')=>buildFormationDecorations({teamId:'a',players:['AGK'],events,results:[result()],ratingMode:mode,resolveCanonicalName:name=>String(name).toLowerCase()}).agk;
test('two completed five-minute blocks credit only the keeper and defenders',()=>{
 const events=fieldMatchStatEvents(result());const blocks=events.filter(e=>e.type==='defensive_block');assert.equal(blocks.length,12);assert.equal(blocks.filter(e=>e.playerName.toLowerCase()==='agk').length,2);assert(!blocks.some(e=>e.playerName.toLowerCase()==='af1'));
});
test('a goal at 5:00 invalidates only the second interval for the defending team',()=>{
 const r=result();r.goalsB=1;r.events=[{id:'g',type:'goal',teamId:'b',scorer:'BF1',timeSeconds:300}];const e=fieldMatchStatEvents(r);assert.equal(e.filter(e=>e.type==='defensive_block'&&e.playerName.toLowerCase()==='agk').length,1);
});
test('a mid-block defender change cannot award either player that incomplete block',()=>{
 const r=result();r.playedSeconds=300;const replacement=lineup('A');replacement.positions.p3='New defender';r.lineupTimeline=[{timeSeconds:0,snapshots:r.confirmedLineupSnapshot},{timeSeconds:150,snapshots:{...r.confirmedLineupSnapshot,a:replacement}}];const events=fieldMatchStatEvents(r);assert(!events.some(e=>e.type==='defensive_block'&&['ad1','new defender'].includes(e.playerName.toLowerCase())));
});
test('clean sheets appear but give no extra Field rating credit',()=>{
 const events=fieldMatchStatEvents(result());assert(events.some(e=>e.type==='clean_sheet'));assert.equal(decor(events).rating,decor(events.filter(e=>e.type!=='clean_sheet')).rating);assert(decor(events).rating>decor([]).rating);
});
test('cards reduce ratings; ten is attainable; below five is attainable',()=>{
 const plain=decor([]).rating;assert(decor([{type:'yellow_card',playerName:'AGK'}]).rating<plain);assert(decor([{type:'red_card',playerName:'AGK'}]).rating<plain);
 assert.equal(decor(Array.from({length:10},(_,i)=>({id:'g'+i,type:'goal',teamId:'a',scorer:'AGK'}))).rating,10);
 assert(decor(Array.from({length:4},(_,i)=>({id:'r'+i,type:'red_card',playerName:'AGK'}))).rating<5);
});
test('unknown historical duration cannot invent defensive blocks',()=>{
 const r=result();delete r.playedSeconds;assert(!fieldMatchStatEvents(r).some(e=>e.type==='defensive_block'));
});
test('recalculation is idempotent and goal corrections remove obsolete blocks',()=>{
 const r=result(),first=fieldMatchStatEvents(r);assert.deepEqual(fieldMatchStatEvents({...r,events:first}),first);
 r.goalsB=1;r.events=[...first,{id:'new-goal',type:'goal',teamId:'b',scorer:'BF1',timeSeconds:60}];assert.equal(fieldMatchStatEvents(r).filter(e=>e.type==='defensive_block'&&e.playerName.toLowerCase()==='agk').length,1);
});
