import test from 'node:test';import assert from 'node:assert/strict';
import {clubDebutNames,fieldDebuts,missingBaselinePlayers} from '../functions/playerDebutPolicy.mjs';
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
test('Club appearances across seasons count, bookings and unused squads do not',()=>{
 assert.deepEqual(clubDebutNames({state:{seasons:[{matchDayHistory:[{playerAppearances:[{playerName:'Alex',matchesPlayed:1},{playerName:'Unused',matchesPlayed:0}]}]}]},teams:[{players:['Not played']}]}),['Alex']);
});
test('league debut requires completed play and retains separate Club identity',()=>{
 const match={status:'completed',teamAId:'a',teamBId:'b',confirmedLineupSnapshot:{a:{positions:{GK:'Alex'},benchSnapshot:['Unused']},b:{positions:{GK:'Alex'}}},events:[{teamId:'a',type:'goal',scorer:'Guest',scorerType:'guest'}]};
 assert.deepEqual(fieldDebuts({results:[match]}),[{clubId:'a',name:'Alex'},{clubId:'b',name:'Alex'}]);assert.deepEqual(fieldDebuts({results:[{...match,status:'live'}]}),[]);
});
test('only debuted players without any valid baseline count, independent of match group',()=>{
 const players=['Alex','Bob','New','Rated'].map(name=>({name}));
 assert.deepEqual(missingBaselinePlayers({players,debutNames:['Alex','Bob','Rated'],baselines:{bob:{defence:3},rated:{gk:4}}}).map(p=>p.name),['Alex']);
 assert.equal(missingBaselinePlayers({players,debutNames:['Alias'],resolveName:n=>n==='Alias'?'Alex':n}).length,1);
});
test('debut projection is idempotent, persists records without overwriting any baseline',async()=>{
 const projection=require('../functions/playerDebutProjection.cjs');const writes=new Map();
 const db={doc:path=>({path}),batch:()=>({set:(ref,data)=>{assert(ref.path.includes('/playerDebuts/'));writes.set(ref.path,data);},commit:async()=>{}})};
 const data={playerAppearances:[{playerName:'Alex',matchesPlayed:1}]};await projection.club(db,'a',data);await projection.club(db,'a',data);assert.equal(writes.size,1);await projection.club(db,'a',{});assert.equal(writes.size,1);
});
test('ordinary live-state updates never rewrite already projected debuts',async()=>{
 const projection=require('../functions/playerDebutProjection.cjs');let batches=0;
 const db={batch:()=>{batches++;return {set:()=>{},commit:async()=>{}}},doc:path=>({path})};
 const before={playerAppearances:[{playerName:'Alex',matchesPlayed:1}]};await projection.syncClub(db,'a',before,{...before,timer:45});assert.equal(batches,0);
});
