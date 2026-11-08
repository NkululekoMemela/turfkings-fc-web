const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {createHash}=require('node:crypto');
function score(live){
 const events=Array.isArray(live.currentEvents)?live.currentEvents:[];
 if(live.status==='completed'&&live.finalSummary)return [Number(live.finalSummary.goalsA)||0,Number(live.finalSummary.goalsB)||0];
 return [live.teamAId,live.teamBId].map(id=>events.filter(e=>e.type==='goal'&&e.teamId===id).length);
}
function phase(live){
 if(live?.status==='completed'||live?.isFinished||live?.timeUp||live?.clockPhase==='full_time')return 'full_time';
 if(live?.awaitingKitVerification)return 'pre_match';
 return ['first_half','halftime','second_half'].includes(live?.clockPhase)?live.clockPhase:'live';
}
function changed(before,after){return after&&['live','completed'].includes(after.status)&&
 (!before||before.fixtureId!==after.fixtureId||before.status!==after.status||phase(before)!==phase(after)||String(score(before))!==String(score(after)));}
function newGoal(before, after) {
 if(!before?.fixtureId || before.fixtureId!==after?.fixtureId || before.status!=='live' || phase(after)==='full_time')return null;
 const goals=match=>(Array.isArray(match.currentEvents)?match.currentEvents:[]).filter(event=>event?.type==='goal');
 const oldIds=new Set(goals(before).map(event=>event.id));
 const oldScore=score(before),newScore=score(after);
 const sides=[after.teamAId,after.teamBId];
 for(const event of goals(after).reverse()){
  const side=sides.indexOf(event.teamId);
  const scorer=String(event.scorer||event.playerName||event.player||'').trim().replace(/\s+/g,' ').slice(0,100);
  if(side<0 || newScore[side]<=oldScore[side] || !event.id || oldIds.has(event.id) || !scorer)continue;
  const seconds=event.timeSeconds==null||event.timeSeconds===''?NaN:Number(event.timeSeconds);
  const minute=Number.isFinite(seconds)&&seconds>=0?String(Math.floor(seconds/60)+1):'';
  return {scorer,minute,side:side===0?'home':'away'};
 }
 return null;
}
function buildHandler({db,messaging,auth,region='us-central1'}){
 return onDocumentWritten({document:'leagueVenues/{venueId}/seasons/{seasonId}/matches/{matchId}',region,retry:true},async event=>{
  const before=event.data?.before?.exists?event.data.before.data():null;
  const after=event.data?.after?.exists?event.data.after.data():null;if(!changed(before,after))return;
  const {venueId,seasonId}=event.params;
  const venue=(await db.doc(`leagueVenues/${venueId}`).get()).data(),season=venue?.league?.activeSeason;
  if(!venue||venue.deleted||season?.id!==seasonId)return;
  const runtime=require('./notificationRuntime.cjs'),uids=new Set([venue.ownerUid].filter(runtime.valid));
  const staff=await db.collection(`leagueVenues/${venueId}/staff`).get();for(const person of staff.docs)if(person.data().status==='active'&&runtime.valid(person.id))uids.add(person.id);
  const clubIds=(season.clubIds||[]).filter(runtime.valid);
  const links=clubIds.length?await db.getAll(...clubIds.map(id=>db.doc(`clubFieldMemberships/${id}`))):[];
  const active=clubIds.filter((id,i)=>links[i].data()?.venueId===venueId&&links[i].data()?.status==='active');
  for(let start=0;start<active.length;start+=10){
   const memberships=await Promise.all(active.slice(start,start+10).map(id=>db.collection(`clubs/${id}/members`).where('status','==','active').get()));
   for(const group of memberships)for(const member of group.docs){const uid=member.data().uid;if(runtime.valid(uid))uids.add(uid);}
  }
  const registered=await runtime.registeredTokens(db,[...uids]),records=[];
  for(const record of registered){const device=(await record.ref.get()).data();if(device?.enabled===true&&device.platform==='android'&&device.liveScoreVersion==='1')records.push(record);}
  if(!records.length)return;
  const clubs=await db.getAll(db.doc(`clubs/${after.teamAId}`),db.doc(`clubs/${after.teamBId}`));
  const [home,away]=clubs.map((s,i)=>({...s.data(),id:i?after.teamBId:after.teamAId}));
  const [homeLogo,awayLogo]=await Promise.all([runtime.groupImage(home),runtime.groupImage(away)]);
  const [goalsA,goalsB]=score(after),stamp=event.data.after.updateTime;
  const version=String(stamp.seconds).padStart(12,'0')+String(stamp.nanoseconds).padStart(9,'0');
  const data={type:'field_live_score',route:'field',venueId,seasonId,fixtureId:after.fixtureId,
   homeName:String(home.name||home.clubName||after.teamALabel||'Home').slice(0,100),awayName:String(away.name||away.clubName||after.teamBLabel||'Away').slice(0,100),
   homeLogo,awayLogo,goalsA:String(goalsA),goalsB:String(goalsB),status:after.status,phase:phase(after),version,
   projectId:process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||'',fanmRenderer:'2'};
  const goal=newGoal(before,after);
  if(goal)Object.assign(data,{goalScorer:goal.scorer,goalMinute:goal.minute,goalSide:goal.side});
  const failures=[];
  for(let i=0;i<records.length;i+=500){
   const batch=records.slice(i,i+500),result=await messaging.sendEach(batch.map(record=>({token:record.token,data:{...data,recipientUid:record.uid},
    android:{priority:'high',ttl:120000,collapseKey:'field-score-'+createHash('sha256').update(`${venueId}:${seasonId}:${after.fixtureId}`).digest('hex').slice(0,20)}})));
   for(let j=0;j<result.responses.length;j++)if(!result.responses[j].success){
    const error=result.responses[j].error;
    if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(error?.code))await batch[j].ref.set({enabled:false},{merge:true});
    else failures.push(error?.code||'send-failed');
   }
  }
  if(failures.length)throw Error('Some live scores need another delivery attempt.');
 });
}
module.exports={buildHandler,score,phase,changed,newGoal};
