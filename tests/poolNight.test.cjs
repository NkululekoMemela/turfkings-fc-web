const test=require('node:test'),assert=require('node:assert/strict');
const {handle}=require('../functions/poolNightService.cjs');
const host={uid:'host',email_verified:true,name:'Host'},player={uid:'player',email_verified:true,name:'Alex'},other={uid:'other',email_verified:true,name:'Sam'};
function fixture(){
 const records=new Map();let queue=Promise.resolve();
 const db={collection:path=>({where:(field,operator,value)=>({limit:()=>({get:async()=>({docs:[...records].filter(([key,data])=>{if(key.split('/').length!==path.split('/').length+1||!key.startsWith(path+'/'))return false;const actual=String(field).split('.').reduce((current,key)=>current?.[key],data);return operator==='in'?value.includes(actual):actual===value;}).map(([key,data])=>({id:key.split('/').at(-1),data:()=>structuredClone(data)}))})})})}),doc:path=>({path,get:async()=>({exists:records.has(path),data:()=>structuredClone(records.get(path))}),create:async data=>{if(records.has(path))throw Object.assign(Error('exists'),{code:6});records.set(path,structuredClone(data));}}),runTransaction:fn=>{
  const result=queue.then(async()=>{const changes=[];const tx={get:async ref=>({exists:records.has(ref.path),data:()=>structuredClone(records.get(ref.path))}),set:(ref,data)=>changes.push([ref.path,structuredClone(data)])};const value=await fn(tx);for(const [key,data]of changes)records.set(key,data);return value;});queue=result.catch(()=>{});return result;
 }};return {db,records};
}
async function setup(){const f=fixture();const call=(user,body)=>handle({db:f.db,user,body});let night=await call(host,{action:'create',name:'Host',tables:2,coins:20});const update=async(user,action,fields={})=>{const result=await call(user,{action,code:night.code,revision:night.revision,...fields});if(result.pool)night=result;else night=await call(host,{action:'load',code:night.code});return result;};return {f,call,update,get night(){return night;}};}
test('verified login required, camera and anonymous identities rejected',async()=>{const {db}=fixture();for(const user of [null,{uid:'anonymous'}, {...host,email_verified:false},{...host,cameraSession:true}])await assert.rejects(handle({db,user,body:{action:'create'}}),/verified/);});
test('night owner approves a UID-bound player before any score access',async()=>{const s=await setup();const request=await s.update(player,'join',{name:'Alex',role:'admin'});assert.equal(request.membership,'pending');assert.equal(request.pool,undefined);await assert.rejects(s.update(player,'approveMember',{uid:player.uid}),/host must approve/);await s.update(host,'approveMember',{uid:player.uid});assert.equal(s.night.pool.players[1].id,player.uid);await assert.rejects(s.update(player,'settings',{tables:3,coins:20,mode:'rotation'}),/Only the night admin/);const stranger=await s.call(other,{action:'load',code:s.night.code});assert.equal(stranger.pool,undefined);assert.equal(stranger.members,undefined);});
test('every approved player can log another table; only host verifies or corrects',async()=>{const s=await setup();await s.update(player,'join');await s.update(host,'approveMember',{uid:player.uid});await s.update(other,'join');await s.update(host,'approveMember',{uid:other.uid});await s.update(host,'start',{table:1,a:host.uid,b:player.uid});const game=s.night.pool.active[0];await s.update(other,'submit',{matchId:game.id,finish:'score',scoreA:7,scoreB:3,winner:'forged'});assert.equal(s.night.pool.active.length,0);assert.equal(s.night.pool.matches[0].verification,'pending');assert.equal(s.night.pool.matches[0].winner,host.uid);assert.equal(s.night.pool.matches[0].submittedByUid,other.uid);await assert.rejects(s.update(player,'verify',{matchId:game.id}),/Only the night admin/);await assert.rejects(s.update(player,'correct',{matchId:game.id,finish:'foul',winner:player.uid}),/Only the night admin/);await s.update(host,'verify',{matchId:game.id});assert.equal(s.night.pool.matches[0].verification,'verified');await s.update(host,'correct',{matchId:game.id,finish:'score',scoreA:2,scoreB:7});assert.equal(s.night.pool.matches[0].winner,player.uid);assert.equal(s.night.audit.length,2);assert.equal(s.night.audit[1].before.scoreA,7);});
test('simultaneous result submissions cannot spend a coin twice',async()=>{const s=await setup();await s.update(player,'join');await s.update(host,'approveMember',{uid:player.uid});await s.update(host,'start',{table:1,a:host.uid,b:player.uid});const game=s.night.pool.active[0],body={action:'submit',code:s.night.code,revision:s.night.revision,matchId:game.id,finish:'score',scoreA:7,scoreB:3};const results=await Promise.allSettled([s.call(player,body),s.call(host,body)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const state=await s.call(host,{action:'load',code:s.night.code});assert.equal(state.pool.coins,19);assert.equal(state.pool.matches.length,1);assert.equal(state.pool.active.length,0);});
test('multiple tables reserve different players; pending verification does not block the next game',async()=>{const s=await setup();for(const uid of ['p1','p2','p3']){const u={uid,email_verified:true,name:uid};await s.update(u,'join');await s.update(host,'approveMember',{uid});}await s.update(host,'start',{table:1,a:'host',b:'p1'});await assert.rejects(s.update(host,'start',{table:2,a:'host',b:'p2'}),/available/);await s.update(host,'start',{table:2,a:'p2',b:'p3'});assert.equal(s.night.pool.active.length,2);const game=s.night.pool.active[0];await s.update(host,'submit',{matchId:game.id,finish:'foul',winner:'host'});await s.update(host,'start',{table:1,a:'host',b:'p1'});assert.equal(s.night.pool.active.length,2);assert.equal(s.night.pool.matches[0].verification,'pending');});
test('bad scores, stale setup and cross-night mutations leave records unchanged',async()=>{const s=await setup();await s.update(player,'join');await s.update(host,'approveMember',{uid:player.uid});await s.update(host,'start',{table:1,a:'host',b:'player'});const before=JSON.stringify([...s.f.records]);await assert.rejects(s.update(player,'submit',{matchId:s.night.pool.active[0].id,finish:'score',scoreA:5,scoreB:3}),/normal finish/);await assert.rejects(s.call(host,{action:'settings',code:s.night.code,revision:0,tables:1,coins:1,mode:'rotation'}),/changed/);await assert.rejects(s.call(player,{action:'submit',code:'AAAAAAAAAA',revision:1}),/not found/);assert.equal(JSON.stringify([...s.f.records]),before);});
test('only verified scores count towards shared standings and server uses identical pairing engine',async()=>{const fs=require('node:fs');assert.equal(fs.readFileSync('functions/poolEngine.mjs','utf8'),fs.readFileSync('src/core/poolTable.mjs','utf8'));const {poolStandings}=await import('../functions/poolEngine.mjs');const players=[{id:'a',name:'A'},{id:'b',name:'B'}];const games=[{a:'a',b:'b',winner:'a',scoreA:7,scoreB:3,verification:'pending'}];assert.equal(poolStandings(players,games.filter(m=>m.verification==='verified'))[0].wins,0);});
test('pool namespace is denied and excluded from the broad legacy allow rule',()=>{const rules=require('node:fs').readFileSync('firestore.rules','utf8');assert.match(rules,/match \/poolNights\/\{document=\*\*\} \{ allow read, write: if false; \}/);assert.match(rules,/&& topLevel != "poolNights"/);});

test('admin handover is atomic, UID-bound, audited and preserves every game and player',async()=>{
 const s=await setup();await s.update(player,'join');await s.update(host,'approveMember',{uid:player.uid});
 await s.update(host,'start',{table:1,a:host.uid,b:player.uid});
 const poolBefore=structuredClone(s.night.pool),code=s.night.code;
 await s.update(host,'transferAdmin',{uid:player.uid});
 assert.equal(s.night.ownerUid,player.uid);assert.deepEqual(s.night.pool,poolBefore);
 assert.equal(s.night.members[host.uid].status,'approved');
 assert.equal(s.night.audit.at(-1).previousOwnerUid,host.uid);assert.equal(s.night.audit.at(-1).nextOwnerUid,player.uid);
 await assert.rejects(s.update(host,'settings',{tables:2,coins:20,mode:'rotation'}),/Only the night admin/);
 await assert.rejects(s.update(host,'transferAdmin',{uid:host.uid}),/Only the night admin/);
 await s.update(other,'join');await s.update(player,'approveMember',{uid:other.uid});
 const game=s.night.pool.active[0];await s.update(host,'submit',{matchId:game.id,finish:'score',scoreA:7,scoreB:3});
 await assert.rejects(s.update(host,'verify',{matchId:game.id}),/Only the night admin/);
 await s.update(player,'verify',{matchId:game.id});assert.equal(s.night.pool.matches[0].verifiedByUid,player.uid);
 const returned=await s.call(player,{action:'load',code});assert.equal(returned.ownerUid,player.uid);
});
test('handover rejects pending, absent, foreign, self and forged or stale requests',async()=>{
 const s=await setup();await s.update(player,'join');
 await assert.rejects(s.update(host,'transferAdmin',{uid:player.uid}),/approved player/);
 await assert.rejects(s.update(host,'transferAdmin',{uid:'stranger'}),/approved player/);
 await assert.rejects(s.update(host,'transferAdmin',{uid:host.uid}),/already/);
 await s.update(host,'approveMember',{uid:player.uid});
 await assert.rejects(s.update(player,'transferAdmin',{uid:player.uid,ownerUid:player.uid}),/Only the night admin/);
 await s.update(host,'presence',{uid:player.uid,present:false});await assert.rejects(s.update(host,'transferAdmin',{uid:player.uid}),/approved player/);
 await s.update(host,'presence',{uid:player.uid,present:true});
 await assert.rejects(s.call(host,{action:'transferAdmin',code:s.night.code,revision:s.night.revision-1,uid:player.uid}),/changed/);
 assert.equal(s.night.ownerUid,host.uid);
});
test('concurrent handovers cannot create two admins',async()=>{
 const s=await setup();for(const u of [player,other]){await s.update(u,'join');await s.update(host,'approveMember',{uid:u.uid});}
 const original=s.night;
 const results=await Promise.allSettled([player,other].map(u=>s.call(host,{action:'transferAdmin',code:original.code,revision:original.revision,uid:u.uid})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const final=await s.call(host,{action:'load',code:original.code});assert.equal(final.audit.filter(item=>item.action==='transferAdmin').length,1);assert.ok([player.uid,other.uid].includes(final.ownerUid));
});

test('saved nights recover existing sessions across devices and preserve admin handover roles',async()=>{
 const s=await setup();await s.update(player,'join');await s.update(host,'approveMember',{uid:player.uid});
 const pending=await s.update(other,'join');assert.equal(pending.membership,'pending');
 let list=await s.call(host,{action:'list',uid:'forged'});assert.equal(list.nights.length,1);assert.equal(list.nights[0].role,'admin');assert.equal(list.nights[0].code,s.night.code);assert.equal(list.nights[0].members,undefined);
 await s.update(host,'transferAdmin',{uid:player.uid});
 list=await s.call(player,{action:'list'});assert.equal(list.nights[0].role,'admin');
 list=await s.call(host,{action:'list'});assert.equal(list.nights[0].role,'player');
 list=await s.call(other,{action:'list'});assert.equal(list.nights[0].role,'pending');
 const stranger={uid:'stranger',email_verified:true};assert.deepEqual((await s.call(stranger,{action:'list',uid:player.uid})).nights,[]);
});

test('retrying a night creation resumes the same code instead of making a duplicate league',async()=>{
 const f=fixture(),body={action:'create',name:'Host',tables:2,coins:20,requestId:'12345678-1234-1234-1234-123456789abc'};
 const first=await handle({db:f.db,user:host,body}),second=await handle({db:f.db,user:host,body});assert.equal(first.code,second.code);assert.equal([...f.records.keys()].filter(path=>path.split('/').length===2).length,1);
});

test('admin can remove a test player; ordinary players and the admin cannot remove the admin',async()=>{
 const s=await setup();await s.update(player,'join');await s.update(host,'approveMember',{uid:player.uid});
 await assert.rejects(s.update(player,'removePlayer',{uid:host.uid}),/Only the night admin/);
 await assert.rejects(s.update(host,'removePlayer',{uid:host.uid}),/Hand admin duties/);
 await s.update(host,'removePlayer',{uid:player.uid});assert.equal(s.night.pool.players.some(p=>p.id===player.uid),false);
 assert.equal(s.night.members[player.uid].status,'removed');const view=await s.call(player,{action:'load',code:s.night.code});assert.equal(view.pool,undefined);assert.equal(view.membership,'removed');
 assert.deepEqual((await s.call(player,{action:'list'})).nights,[]);
 await assert.rejects(s.update(player,'settings',{tables:2,coins:20,mode:'rotation'}),/host must approve/);
});
test('removal never deletes historical results or duplicates a reapproved player',async()=>{
 const s=await setup();await s.update(player,'join');await s.update(host,'approveMember',{uid:player.uid});await s.update(host,'start',{table:1,a:host.uid,b:player.uid});
 await assert.rejects(s.update(host,'removePlayer',{uid:player.uid}),/active game/);
 const game=s.night.pool.active[0];await s.update(player,'submit',{matchId:game.id,finish:'score',scoreA:7,scoreB:3});const history=structuredClone(s.night.pool.matches);
 await s.update(host,'removePlayer',{uid:player.uid});assert.deepEqual(s.night.pool.matches,history);assert.equal(s.night.pool.players.find(p=>p.id===player.uid).removed,true);
 const retry=await s.update(player,'join');assert.equal(retry.membership,'pending');await s.update(host,'approveMember',{uid:player.uid});assert.equal(s.night.pool.players.filter(p=>p.id===player.uid).length,1);assert.equal(s.night.pool.players.find(p=>p.id===player.uid).removed,false);assert.deepEqual(s.night.pool.matches,history);
});
