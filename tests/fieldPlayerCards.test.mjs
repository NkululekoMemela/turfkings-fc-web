import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFieldPlayerCards} from '../src/core/fieldPlayerCards.mjs';
const result=(id='m')=>({fixtureId:id,status:'completed',teamAId:'a',teamBId:'b',winnerId:'a',goalsA:1,goalsB:0,events:[{id:`goal-${id}`,teamId:'a',type:'goal',scorer:'Alex'}],confirmedLineupSnapshot:{a:{positions:{p1:'Alex'},kitNumbers:[{name:'Alex',key:'a1',number:1}]},b:{positions:{p1:'Alex'},kitNumbers:[{name:'Alex',key:'b1',number:2}]}}});
test('cards retain Club identity for same-named opponents and exclude unrelated roster members',()=>{
 const cards=buildFieldPlayerCards({season:{results:[result()]},profiles:[{clubId:'a',name:'Unrelated'},{clubId:'a',name:'Alex',photoUrl:'a-photo'},{clubId:'b',name:'Alex',photoUrl:'b-photo'}]});
 assert.equal(cards.length,2);assert.equal(new Set(cards.map(c=>c.id)).size,2);
 assert.equal(cards.find(c=>c.id.startsWith('a::')).goals,1);assert.equal(cards.find(c=>c.id.startsWith('b::')).goals,0);
 assert.equal(cards.find(c=>c.id.startsWith('a::')).photoUrl,'a-photo');assert(cards.every(c=>c.peerScore10===null&&c.attackAvg===null));
});
test('current corrections replace archived copies and ratings remain the recorded Field ratings',()=>{
 const old=result();old.events=[];
 const cards=buildFieldPlayerCards({season:{matchDayHistory:[{results:[old]}],results:[result()]}});
 assert(cards.every(c=>c.gamesPlayed===1));assert.equal(cards[0].goals,1);assert(cards[0].overall>cards[1].overall);
});
test('no confirmed appearance means no invented card, including live matches',()=>{
 assert.deepEqual(buildFieldPlayerCards({season:{results:[{...result(),status:'live'}]}}),[]);
 const r=result();delete r.confirmedLineupSnapshot;assert.deepEqual(buildFieldPlayerCards({season:{results:[r]}}),[]);
});
