const test=require('node:test'),assert=require('node:assert/strict');
const {resolveFeatureScope}=require('../functions/fieldPracticeFeatureScope.cjs');
const {operate}=require('../functions/fieldLostFoundService.js');
const scope={kind:'venueLeague',environment:'practice',venueId:'field',practiceSessionId:'session'};
function fixture(){const root='sandboxes/practice/leagueVenues/field/sessions/session',records=new Map([['practiceSessions/session',{kind:'venueLeague',environment:'practice',venueId:'field',sessionId:'session',userId:'user',status:'active',expiresAt:{toMillis:()=>Date.now()+900000}}],[root,{name:'Field'}]]),access=[];
 const ref=path=>({id:path.split('/').at(-1),get:async()=>{access.push(path);return {exists:records.has(path),data:()=>records.get(path)};},create:async data=>{access.push(path);records.set(path,data);}});
 const db={
  doc:ref,
  getAll:async(...refs)=>Promise.all(refs.map(r=>r.get())),
  collection:path=>({doc:id=>ref(path+'/'+id),where:()=>({get:async()=>({docs:[...records].filter(([p])=>p.startsWith(path+'/')).map(([p,data])=>({id:p.split('/').at(-1),data:()=>data}))})})})
 };
 return {db,records,root,access};
}

test('Practice access requires the current owner, Field and unexpired session',async()=>{for(const patch of [{userId:'other'},{status:'expired'},{expiresAt:{toMillis:()=>0}},{venueId:'elsewhere'}]){const f=fixture();Object.assign(f.records.get('practiceSessions/session'),patch);await assert.rejects(resolveFeatureScope({db:f.db,user:{uid:'user'},body:{scope},venueId:'field'}));}});
test('Practice lost property and photos stay in its sandbox and do not need Official membership',async()=>{const f=fixture(),user={uid:'user',name:'User'};const photo='data:image/jpeg;base64,'+Buffer.from([255,216,255,217]).toString('base64');const result=await operate({db:f.db,user,body:{scope,venueId:'field',action:'found',description:'Training jacket',details:'Name on the inside label',place:'Changing room',date:'2026-11-03',photo},photoBucket:{file:()=>{throw Error('Practice must not use Official storage');}}});assert(f.records.has(f.root+'/fieldLostFoundItems/'+result.id));const saved=await operate({db:f.db,user,body:{scope,venueId:'field',action:'photo',itemId:result.id}});assert.equal(saved.photo,photo);assert(f.access.every(p=>p==='practiceSessions/session'||p.startsWith(f.root)));});
test('unknown environments never silently fall back to Official',async()=>{const f=fixture();await assert.rejects(resolveFeatureScope({db:f.db,user:{uid:'user'},body:{scope:{...scope,environment:'mistyped'}},venueId:'field'}));});
