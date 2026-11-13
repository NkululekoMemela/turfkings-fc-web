const {onRequest}=require('firebase-functions/v2/https');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {randomUUID}=require('node:crypto');
const {computeNextFromResult}=require('./fieldResultRotation.cjs');
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(s);
function reverseResult(season,fixtureId){
 const same=r=>String(r.fixtureId||r.id||'')===fixtureId;
 const result=(season.results||[]).find(same)||(season.matchDayHistory||[]).flatMap(d=>d.results||[]).find(same);
 if(!result)throw Error('This recorded match no longer exists.');
 const fixture=(season.fixtures||[]).find(f=>f.id===fixtureId);
 if(!fixture||fixture.status!=='completed')throw Error('This fixture is no longer completed.');
 if(Object.values(season.liveMatches||{}).some(m=>m.status==='live'))throw Error('Finish or cancel the live match before reversing this result.');
 const matchesEvent=(e)=>e.fixtureId===fixtureId||(!e.fixtureId&&result.matchNo!=null&&Number(e.matchNo)===Number(result.matchNo));
 const liveMatches={...(season.liveMatches||{})};delete liveMatches[fixtureId];
 const {goalsA,goalsB,scoreA,scoreB,winnerId,isDraw,completedByUid,completedAtMs,...scheduled}=fixture;
 const dayId=fixture.matchDayId;
 const reopens=day=>(day.scheduledMatchDayId||day.id)===dayId||(day.results||[]).some(same);
 const reopenedDays=(season.matchDayHistory||[]).filter(reopens);
 const history=(season.matchDayHistory||[]).filter(day=>!reopens(day));
 const allResults=[...(season.results||[]),...reopenedDays.flatMap(d=>d.results||[])];
 const keptResults=[...new Map(allResults.filter(r=>!same(r)).map(r=>[String(r.fixtureId||r.id||r.matchNo),r])).values()];
 const combinedEvents=[...(season.allEvents||[]),...reopenedDays.flatMap(d=>d.allEvents||[])];
 const keptEvents=[...new Map(combinedEvents.filter(e=>!matchesEvent(e)).map(e=>[e.id||JSON.stringify(e),e])).values()];
 let streaks=Object.fromEntries((season.clubIds||[]).map(id=>[id,0]));
 for(const r of [...keptResults].sort((a,b)=>Number(a.matchNo)-Number(b.matchNo)))streaks=computeNextFromResult(streaks,{teamAId:r.teamAId||r.clubAId,teamBId:r.teamBId||r.clubBId,standbyId:r.standbyId,goalsA:Number(r.goalsA??r.scoreA)||0,goalsB:Number(r.goalsB??r.scoreB)||0}).updatedStreaks;
 delete streaks.undefined;delete streaks.null;
 const nextFixture=(season.fixtures||[]).find(f=>f.id===fixtureId||f.status==='scheduled');
 const currentMatch=nextFixture?{teamAId:nextFixture.clubAId,teamBId:nextFixture.clubBId,standbyId:(season.clubIds||[]).find(id=>id!==nextFixture.clubAId&&id!==nextFixture.clubBId)||null}:season.currentMatch;
 const next={...season,streaks,currentMatch,status:'active',fixtures:season.fixtures.map(f=>f.id===fixtureId?{...scheduled,status:'scheduled',replayRequestedAtMs:Date.now()}:f),liveMatches,results:keptResults,allEvents:keptEvents,currentEvents:(season.currentEvents||[]).filter(e=>!matchesEvent(e)),matchDayHistory:history,matchDays:(season.matchDays||[]).map(d=>d.id===dayId?{...d,status:'scheduled'}:d),updatedAtMs:Date.now()};
 // Keep match numbers monotonic: replay cannot reuse IDs of retained events.
 return {season:next,result,fixture};
}
exports.reverseResult=reverseResult;
exports.reversalHandler=async(req,res,dependencies={})=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)throw Error('Sign in first.');const user=await (dependencies.verifyToken||((value,revoked)=>getAuth().verifyIdToken(value,revoked)))(token,true);if(!user.email_verified||user.cameraSession)throw Error('Use your verified manager account.');
  const {venueId,seasonId,fixtureId,discardUnarchived}=req.body||{};
  const bulk=discardUnarchived===true;
  const reason=bulk?"Field Manager deleted unarchived match day results.":String(req.body?.reason||'').trim();
  if(![venueId,seasonId].every(valid)||(!bulk&&!valid(fixtureId))||reason.length<5||reason.length>300)
   throw Error('Choose a match and give a short reason.');
  const db=dependencies.db||getFirestore(),venueRef=db.doc(`leagueVenues/${venueId}`);
  const count=await db.runTransaction(async tx=>{
   const v=await tx.get(venueRef);
   if(!v.exists)throw Error('Field no longer exists.');
   const venue=v.data(),season=venue.league?.activeSeason;
   if(venue.ownerUid!==user.uid)throw Error('Only the Field Manager can reverse an official result.');
   if(season?.id!==seasonId||season.status!=='active')throw Error('The active season changed. Reopen the result.');
   const archived=new Set((season.matchDayHistory||[]).flatMap(day=>(day.results||[]).map(result=>result.fixtureId||result.id)));
   const ids=bulk?[...new Set((season.results||[]).filter(result=>result.status==='completed')
    .map(result=>result.fixtureId||result.id).filter(id=>!archived.has(id)))]:[fixtureId];
   if(!ids.length)throw Error('There are no unarchived games to delete.');
   if(ids.length>100||!ids.every(valid))throw Error('Reverse these results individually.');
   const matchesRef=venueRef.collection('seasons').doc(seasonId).collection('matches');
   const saved=await tx.getAll(...[...new Set([...ids,'current'])].map(key=>matchesRef.doc(key)));
   const legacy=saved.find(snapshot=>snapshot.id==='current')?.data();
   if(legacy?.status==='live')throw Error('Finish or cancel the live match before reversing this result.');
   let next=season;
   for(const selectedId of ids){
    const reversed=reverseResult(next,selectedId);
    const id=randomUUID();
    const previousMatches=saved.filter(snapshot=>snapshot.exists&&snapshot.data().fixtureId===selectedId);
    tx.create(venueRef.collection('matchReversals').doc(id),{venueId,seasonId,fixtureId:selectedId,reason,
     actorUid:user.uid,at:FieldValue.serverTimestamp(),result:reversed.result,fixture:reversed.fixture,
     previousMatches:previousMatches.map(snapshot=>({documentId:snapshot.id,match:snapshot.data()})),
     events:[...(next.allEvents||[]),...(next.matchDayHistory||[]).flatMap(day=>day.allEvents||[])].filter(event=>
       event.fixtureId?event.fixtureId===selectedId:reversed.result.matchNo!=null&&Number(event.matchNo)===Number(reversed.result.matchNo)),
     previousMatchDays:next.matchDays||[],
     previousHistory:(next.matchDayHistory||[]).filter(day=>(day.scheduledMatchDayId||day.id)===reversed.fixture.matchDayId)});
    for(const snapshot of previousMatches)tx.delete(snapshot.ref);
    tx.create(venueRef.collection('actionLog').doc(id),{venueId,seasonId,fixtureId:selectedId,
     action:'match_reversed',label:'Official match reversed',
     details:`${reversed.result.teamAName||reversed.fixture.clubAName||reversed.fixture.clubAId} vs ${reversed.result.teamBName||reversed.fixture.clubBName||reversed.fixture.clubBId}: ${reason}`.slice(0,500),
     actorUid:user.uid,actorEmail:user.email||'',actorName:user.name||user.email||user.uid,at:FieldValue.serverTimestamp()});
    next=reversed.season;
   }
   tx.update(venueRef,{'league.activeSeason':next,updatedAt:FieldValue.serverTimestamp()});
   return ids.length;
  });return res.json({reversed:true,count});
 }catch(e){return res.status(400).json({error:e.message||'Could not reverse this match.'});}
};
exports.reverseFieldRecordedMatch=onRequest({region:'us-central1',invoker:'public',cors:true},(req,res)=>exports.reversalHandler(req,res));
