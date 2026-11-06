const {createHash}=require('node:crypto');

async function record(db,rows){
 for(let index=0;index<rows.length;index+=350){
  const batch=db.batch();
  for(const {clubId,name}of rows.slice(index,index+350)){
   if(!clubId||clubId.includes('/'))continue;
   const key=createHash('sha256').update(name.trim().toLowerCase().replace(/\s+/g,' ')).digest('hex');
   batch.set(db.doc(`clubs/${clubId}/playerDebuts/${key}`),{name,hasPlayed:true},{merge:true});
  }
  await batch.commit();
 }
}
exports.club=async(db,clubId,data)=>{const {clubDebutNames}=await import('./playerDebutPolicy.mjs');return record(db,clubDebutNames(data).map(name=>({clubId,name})));};
exports.field=async(db,data)=>{const {fieldDebuts}=await import('./playerDebutPolicy.mjs');return record(db,fieldDebuts(data?.league?.activeSeason||data||{}));};
exports.backfill=async db=>{
 const done=db.doc('playerDebutMigrations/v1');if((await done.get()).exists)return;
 for(const club of (await db.collection('clubs').get()).docs){const state=await db.doc(`clubs/${club.id}/state/main`).get();await exports.club(db,club.id,state.data()||{});}
 for(const venue of (await db.collection('leagueVenues').get()).docs){await exports.field(db,venue.data());for(const season of (await venue.ref.collection('seasons').get()).docs)await exports.field(db,season.data());}
 await done.set({completed:true});
};

exports.syncClub=async(db,clubId,before,after)=>{
 const {clubDebutNames}=await import('./playerDebutPolicy.mjs');
 const prior=new Set(clubDebutNames(before).map(n=>n.trim().toLowerCase()));
 return record(db,clubDebutNames(after).filter(n=>!prior.has(n.trim().toLowerCase())).map(name=>({clubId,name})));
};
exports.syncField=async(db,before,after)=>{
 const {fieldDebuts}=await import('./playerDebutPolicy.mjs');
 const rows=data=>fieldDebuts(data?.league?.activeSeason||data||{});
 const key=row=>`${row.clubId}::${row.name.trim().toLowerCase()}`;
 const prior=new Set(rows(before).map(key));
 return record(db,rows(after).filter(row=>!prior.has(key(row))));
};
