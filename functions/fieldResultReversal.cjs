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
 const matchesEvent=(e)=>e.fixtureId===fixtureId||Number(e.matchNo)===Number(result.matchNo);
 const liveMatches={...(season.liveMatches||{})};delete liveMatches[fixtureId];
 const {goalsA,goalsB,scoreA,scoreB,winnerId,isDraw,completedByUid,completedAtMs,...scheduled}=fixture;
 const dayId=fixture.matchDayId;
 const reopenedDays=(season.matchDayHistory||[]).filter(day=>(day.results||[]).some(same));
 const history=(season.matchDayHistory||[]).filter(day=>!(day.results||[]).some(same));
 const allResults=[...(season.results||[]),...reopenedDays.flatMap(d=>d.results||[])];
 const keptResults=[...new Map(allResults.filter(r=>!same(r)).map(r=>[String(r.fixtureId||r.id||r.matchNo),r])).values()];
 const combinedEvents=[...(season.allEvents||[]),...reopenedDays.flatMap(d=>d.allEvents||[])];
 const keptEvents=[...new Map(combinedEvents.filter(e=>!matchesEvent(e)).map(e=>[e.id||JSON.stringify(e),e])).values()];
 let streaks=Object.fromEntries((season.clubIds||[]).map(id=>[id,0]));
 for(const r of [...keptResults].sort((a,b)=>Number(a.matchNo)-Number(b.matchNo)))streaks=computeNextFromResult(streaks,{teamAId:r.teamAId||r.clubAId,teamBId:r.teamBId||r.clubBId,standbyId:r.standbyId,goalsA:Number(r.goalsA??r.scoreA)||0,goalsB:Number(r.goalsB??r.scoreB)||0}).updatedStreaks;
 delete streaks.undefined;delete streaks.null;
 const nextFixture=(season.fixtures||[]).find(f=>f.id===fixtureId||f.status==='scheduled');
 const currentMatch=nextFixture?{teamAId:nextFixture.clubAId,teamBId:nextFixture.clubBId,standbyId:(season.clubIds||[]).find(id=>id!==nextFixture.clubAId&&id!==nextFixture.clubBId)||null}:season.currentMatch;
 const next={...season,streaks,currentMatch,status:'active',fixtures:season.fixtures.map(f=>f.id===fixtureId?{...scheduled,status:'scheduled'}:f),liveMatches,results:keptResults,allEvents:keptEvents,currentEvents:(season.currentEvents||[]).filter(e=>!matchesEvent(e)),matchDayHistory:history,matchDays:(season.matchDays||[]).map(d=>d.id===dayId?{...d,status:'scheduled'}:d),updatedAtMs:Date.now()};
 // Keep match numbers monotonic: replay cannot reuse IDs of retained events.
 return {season:next,result,fixture};
}
exports.reverseResult=reverseResult;
exports.reverseFieldRecordedMatch=onRequest({region:'us-central1',invoker:'public',cors:true},async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!token)throw Error('Sign in first.');const user=await getAuth().verifyIdToken(token,true);if(!user.email_verified||user.cameraSession)throw Error('Use your verified manager account.');
  const {venueId,seasonId,fixtureId}=req.body||{},reason=String(req.body?.reason||'').trim();if(![venueId,seasonId,fixtureId].every(valid)||reason.length<5||reason.length>300)throw Error('Choose a match and give a short reason.');
  const db=getFirestore(),venueRef=db.doc(`leagueVenues/${venueId}`),id=randomUUID();
  await db.runTransaction(async tx=>{
   const v=await tx.get(venueRef);if(!v.exists)throw Error('Field no longer exists.');const venue=v.data();if(venue.ownerUid!==user.uid)throw Error('Only the Field Manager can reverse an official result.');const season=venue.league?.activeSeason;if(season?.id!==seasonId)throw Error('The season changed. Reopen the result.');
   const currentRef=venueRef.collection('seasons').doc(seasonId).collection('matches').doc(require('./fieldMatchDocuments.cjs').fieldMatchDocumentId(season,fixtureId)),current=await tx.get(currentRef);
   const reversed=reverseResult(season,fixtureId);
   tx.create(venueRef.collection('matchReversals').doc(id),{seasonId,fixtureId,reason,actorUid:user.uid,at:FieldValue.serverTimestamp(),result:reversed.result,fixture:reversed.fixture,events:(season.allEvents||[]).filter(e=>e.fixtureId===fixtureId||Number(e.matchNo)===Number(reversed.result.matchNo)),previousMatchDays:season.matchDays||[],previousHistory:(season.matchDayHistory||[]).filter(d=>(d.results||[]).some(r=>String(r.fixtureId||r.id||'')===fixtureId))});
   tx.update(venueRef,{'league.activeSeason':reversed.season,updatedAt:FieldValue.serverTimestamp()});
   if(current.exists&&current.data().fixtureId===fixtureId)tx.delete(currentRef);
   tx.create(venueRef.collection('actionLog').doc(id),{venueId,seasonId,fixtureId,action:'match_reversed',label:'Official match reversed',details:`${reversed.result.teamAName||reversed.fixture.clubAName} vs ${reversed.result.teamBName||reversed.fixture.clubBName}: ${reason}`,actorUid:user.uid,actorEmail:user.email||'',actorName:user.name||user.email||user.uid,at:FieldValue.serverTimestamp()});
  });return res.json({reversed:true});
 }catch(e){return res.status(400).json({error:e.message||'Could not reverse this match.'});}
});
