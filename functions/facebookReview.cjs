const {createHash}=require('node:crypto');
const PAGE_ID='1184989511353566';
const QUEUE='facebookHighlightQueue';
const OWNER='nkululekolerato@gmail.com';
const str=v=>typeof v==='string'?v.trim():'';
function operator(user){return user?.email_verified===true&&str(user.email).toLowerCase()===OWNER;}
function eligible(h){return h&&h.archiveCategory==='goal'&&Number(h.archiveRank)===1&&Number(h.voteCount)>0&&h.status==='archived'&&h.isPracticeMode!==true&&h.environment!=='practice'&&h.mode!=='practice';}
function queueId(path){return createHash('sha256').update(path).digest('hex');}
function mediaURL(h){return str(h.downloadUrl||h.videoUrl||h.mediaUrl||h.fileUrl||h.publicUrl||h.url);}
function validMedia(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['firebasestorage.googleapis.com','storage.googleapis.com'].includes(u.hostname);}catch{return false;}}
function caption({playerName,clubName,fieldName}){return `🔥 WHAT A MOMENT! ${playerName} brings the heat for ${clubName} at ${fieldName}! ⚽\n\nYour voted goal of the night. Watch it again and give the scorer some love!\n\n#5AsidesNearMe #GoalOfTheNight #CapeTownFootball`;}
function validateDraft(d){for(const key of ['playerName','clubName','fieldName'])if(!str(d[key])||d[key].length>160)throw Error('Enter the scorer, Club and Field names.');if(!validMedia(d.videoUrl))throw Error('This clip needs a playable Firebase Storage video URL.');if(!str(d.caption)||d.caption.length>4000)throw Error('Enter a caption of 1–4000 characters.');for(const key of ['playerName','clubName','fieldName'])if(!d.caption.toLowerCase().includes(d[key].toLowerCase()))throw Error('The caption must include the scorer, Club and Field names.');}
async function capture({db,path,h}){
 if(!eligible(h))return;
 const parts=path.split('/');if(parts.length!==6||!['clubs','leagueVenues'].includes(parts[0])||parts[2]!=='video_highlights'||parts[4]!=='archived')return;
 const parent=await db.doc(`${parts[0]}/${parts[1]}`).get();const info=parent.data()||{};
 const field=parts[0]==='leagueVenues';
 const draft={playerName:str(h.playerName||h.goalScorerName||h.scorerName||(typeof h.scorer==='string'?h.scorer:'')),clubName:str(field?h.teamName||h.scoringClubName:h.clubName||info.name),fieldName:str(field?info.name||info.venueName:h.fieldName||h.venueName),videoUrl:mediaURL(h)};
 const ref=db.collection(QUEUE).doc(queueId(path));
 await db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists)return;tx.create(ref,{...draft,caption:caption(draft),sourcePath:path,scope:field?'field':'club',matchId:parts[3],clipId:parts[5],status:'pending',revision:1,createdAt:Date.now(),updatedAt:Date.now(),pageId:PAGE_ID});});
}
async function meta(token,path,body){
 const response=await fetch(`https://graph.facebook.com/v26.0/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(90000)});
 const data=await response.json();if(!response.ok||data.error)throw Error(`Facebook request failed (${data.error?.code||response.status}). Check connection and clip format.`);return data;
}
async function handle({db,user,body,token,liveEnabled=false}){
 if(!operator(user))throw Error('Only the verified 5 Asides Near Me owner can review Facebook posts.');
 const action=body.action;
 if(action==='count'){const result=await db.collection(QUEUE).where('status','==','pending').count().get();return {pending:result.data().count};}
 if(action==='list'){const snap=await db.collection(QUEUE).orderBy('createdAt','desc').limit(60).get();const items=snap.docs.map(d=>({id:d.id,...d.data()}));if(/^[a-f0-9]{64}$/.test(body.draftId||'')&&!items.some(d=>d.id===body.draftId)){const requested=await db.collection(QUEUE).doc(body.draftId).get();if(requested.exists)items.unshift({id:requested.id,...requested.data()});}return {items,liveEnabled,pageId:PAGE_ID};}
 if(action==='connection'){const result=await meta(token,'me?fields=id,name');if(result.id!==PAGE_ID)throw Error('The secret is not the expected Page token.');return {connected:true,name:result.name,pageId:result.id,liveEnabled};}
 if(!/^[a-f0-9]{64}$/.test(body.id||''))throw Error('Choose a valid draft.');
 const ref=db.collection(QUEUE).doc(body.id);
 if(action==='save'||action==='reject'){
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);const d=snap.data();if(!d||!['pending','rejected'].includes(d.status)||d.revision!==body.revision)throw Error('Draft changed. Refresh before editing.');
   let patch={status:'rejected'};
   if(action==='save'){patch={};for(const k of ['playerName','clubName','fieldName','caption'])patch[k]=str(body[k]);validateDraft({...d,...patch});patch.status='pending';}
   tx.update(ref,{...patch,revision:d.revision+1,updatedAt:Date.now(),editedBy:user.uid});});return {ok:true};
 }
 if(action==='approve'){
  if(!liveEnabled)throw Error('Facebook publishing is disabled in this environment. Preview and save drafts here.');
  let approved;
  await db.runTransaction(async tx=>{const snap=await tx.get(ref);const d=snap.data();if(!d||d.status!=='pending'||d.revision!==body.revision)throw Error('Draft changed or already submitted. Refresh.');validateDraft(d);
   const source=await tx.get(db.doc(d.sourcePath));if(!source.exists||!eligible(source.data())||mediaURL(source.data())!==d.videoUrl)throw Error('The winning clip changed or was removed. Do not publish this draft.');
   const lock=db.doc(`facebookPublicationLocks/${queueId(d.videoUrl.split('?')[0])}`);const prior=await tx.get(lock);if(prior.exists)throw Error('This video has already been approved for Facebook.');tx.create(lock,{queueId:body.id,approvedBy:user.uid,approvedAt:Date.now()});
   approved=d;tx.update(ref,{status:'publishing',approvedBy:user.uid,approvedAt:Date.now(),updatedAt:Date.now(),revision:d.revision+1});});
  // Never automatically retry a publishing attempt: an interrupted request may have reached Meta.
  try{
   const start=await meta(token,`${PAGE_ID}/video_reels`,{upload_phase:'start'});
   if(!/^\d+$/.test(String(start.video_id||'')))throw Error('Facebook did not return a video ID.');
   await ref.update({facebookVideoId:String(start.video_id),phase:'upload',updatedAt:Date.now()});
   const upload=new URL(start.upload_url);if(upload.protocol!=='https:'||upload.hostname!=='rupload.facebook.com')throw Error('Unexpected Facebook upload destination.');
   const result=await fetch(upload.href,{method:'POST',headers:{Authorization:`OAuth ${token}`,file_url:approved.videoUrl},signal:AbortSignal.timeout(90000)});
   const data=await result.json();if(!result.ok||data.success!==true)throw Error('Facebook could not upload this clip. Check its format and availability.');
   await ref.update({phase:'finish',updatedAt:Date.now()});
   const finish=await meta(token,`${PAGE_ID}/video_reels`,{upload_phase:'finish',video_id:String(start.video_id),video_state:'PUBLISHED',description:approved.caption});
   if(finish.success!==true)throw Error('Facebook has not confirmed the publishing request.');
   await ref.update({status:'processing',phase:'processing',updatedAt:Date.now()});return {ok:true};
  }catch(e){await ref.update({status:'needs_attention',lastError:e.message,updatedAt:Date.now()});return {ok:false,error:e.message};}
 }
 if(action==='status'){
  const snap=await ref.get(),d=snap.data();if(!d?.facebookVideoId)return {ok:true};
  const result=await meta(token,`${d.facebookVideoId}?fields=status,permalink_url`);
  const published=result.status?.publishing_phase?.publish_status==='published';
  await ref.update({...(published?{status:'published',publishedAt:Date.now(),permalink:`https://www.facebook.com/reel/${d.facebookVideoId}`} : {}),facebookStatus:result.status||{},updatedAt:Date.now()});return {ok:true,published};
 }
 throw Error('Unknown review action.');
}
module.exports={PAGE_ID,QUEUE,operator,eligible,queueId,validMedia,caption,validateDraft,capture,handle};
