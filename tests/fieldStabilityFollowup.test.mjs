import test from 'node:test';
import assert from 'node:assert/strict';
import {stockFixtureColours,stockFixtureBibs} from '../functions/confirmedFieldBibs.mjs';
import {automaticFixtureBibs,fixtureColours} from '../functions/automaticFixtureKit.mjs';
import {nextBibAssignments} from '../src/core/fieldBibStock.mjs';
import liveScore from '../functions/fieldLiveScore.cjs';
const players=Array.from({length:6},(_,i)=>({sourcePlayerId:`p${i}`,fullName:`Player ${i}`,ownsNumberedBib:false}));
const stock=[7,8,9,10,11,12].flatMap(number=>[{color:'Blue',number,quantity:1},{color:'Orange',number,quantity:1}]);
test('an empty or insufficient confirmed inventory cannot invent kit numbers or a second colour',()=>{
 assert.deepEqual(stockFixtureColours({}, {}, []),{home:'',away:''});
 assert(stockFixtureBibs(players,'Blue',[]).every(p=>p.jerseyNumber===null&&!p.matchBib.assigned&&!p.matchBib.available));
 const short=stock.filter(row=>row.color==='Blue'&&row.number<11);
 assert.deepEqual(fixtureColours({}, {},short),{home:'',away:''});
});
test('Field allocation uses the actual numbers in stock rather than assuming numbers one to six',()=>{
 const result=automaticFixtureBibs(players,'Blue',stock);
 assert.deepEqual(result.map(p=>p.jerseyNumber),[7,8,9,10,11,12]);
 assert(result.every(p=>p.matchBib.available&&p.matchBib.reservationStatus==='stock_confirmed'));
 const colours=stockFixtureColours({homeColor:'Blue'},{homeColor:'Blue'},stock);
 assert.equal(colours.home,'Blue');assert.equal(colours.away,'Orange');
});
test('out of stock numbers are not assigned, and personal matching bibs do not consume inventory',()=>{
 const result=stockFixtureBibs([{...players[0],ownsNumberedBib:true,jerseyNumber:22,bibColor:'Blue'},...players.slice(1)],'Blue',stock.filter(row=>row.number!==12));
 assert.equal(result[0].jerseyNumber,22);assert.equal(result[0].matchBib.source,'club');
 assert(result.every(p=>p.jerseyNumber!==12));assert.equal(new Set(result.map(p=>p.jerseyNumber)).size,6);
});
test('the stock table cannot advertise a legacy planned assignment as confirmed physical stock',()=>{
 const clubs=[{clubId:'club',name:'Club',matchColour:'Blue',players:players.map((p,i)=>({...p,jerseyNumber:i+1,matchBib:{source:'hired',number:i+1,color:'Blue'}}))}];
 for(const confirmed of [false,true]){const row=nextBibAssignments(clubs,stock,confirmed)[0];assert.equal(row.ready,false);assert.deepEqual(row.numbers,[]);assert.equal(row.color,'');}
});
test('live score notifications react to goals and the final whistle, never ordinary clock writes',()=>{
 const before={fixtureId:'f',status:'live',teamAId:'a',teamBId:'b',secondsLeft:100,currentEvents:[]};
 assert.equal(liveScore.changed(before,{...before,secondsLeft:99}),false);
 const goal={...before,currentEvents:[{type:'goal',teamId:'a'}]};assert.equal(liveScore.changed(before,goal),true);assert.deepEqual(liveScore.score(goal),[1,0]);
 const final={...goal,status:'completed',finalSummary:{goalsA:1,goalsB:0}};assert.equal(liveScore.changed(goal,final),true);assert.equal(liveScore.changed(final,{...final}),false);
});
