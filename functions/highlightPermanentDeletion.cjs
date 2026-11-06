const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue,FieldPath}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const {isMemory,weeklyDeadline,canonicalVideoPath}=require('./highlightRetentionPolicy.cjs');
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(s);
async function authorised(db,user,kind,ownerId){
 const root=kind==='field'?'leagueVenues':'clubs',ref=db.doc(`${root}/${ownerId}`),owner=(await ref.get()).data();if(!owner||owner.deleted)throw Error('This group is unavailable.');
 if(owner.ownerUid===user.uid||owner.createdByUid===user.uid)return;
 if(kind==='field'){const staff=(await ref.collection('staff').doc(user.uid).get()).data();if(staff?.status==='active'&&(staff.isAdministrator===true||staff.role==='referee'))return;}
 else{
  if((owner.adminUids||[]).includes(user.uid))return;
  const members=await ref.collection('members').get();for(const d of members.docs){const m=d.data();if(m.status==='active'&&['admin','captain'].includes(m.role)&&(m.uid===user.uid||String(m.email||'').toLowerCase()===String(user.email||'').toLowerCase()))return;}
 }throw Error('Only authorised group administrators can permanently delete clips.');
}
async function removeClip(db,matchRef,clipId,context,{protectWinner=false}={}){
 const [raw,archive]=await Promise.all([matchRef.collection('raw').doc(clipId).get(),matchRef.collection('archived').doc(clipId).get()]);
 if(protectWinner&&archive.exists){await matchRef.collection('cleanup_queue').doc(clipId).delete();return {protected:true};}
 const versions=[raw,archive].filter(d=>d.exists).map(d=>d.data());
 const storedPath=d=>{if(d.storagePath)return d.storagePath;try{const url=new URL(d.mediaUrl||d.videoUrl||d.downloadUrl||'');if(url.hostname!=='firebasestorage.googleapis.com')return '';const match=url.pathname.match(/\/o\/(.+)$/);return match?decodeURIComponent(match[1]):'';}catch{return '';}};
 const paths=[...new Set(versions.map(storedPath).filter(Boolean))];
 if(versions.length&&!paths.length)throw Error('This older clip has no stored file reference. Metadata was retained for repair.');
 for(const path of paths){if(!canonicalVideoPath(path,context))throw Error('The stored video path does not belong to this match.');await getStorage().bucket().file(path).delete({ignoreNotFound:true});}
 const batch=db.batch();batch.delete(matchRef.collection('raw').doc(clipId));batch.delete(matchRef.collection('archived').doc(clipId));batch.delete(matchRef.collection('cleanup_queue').doc(clipId));await batch.commit();return {deleted:true};
}
exports.permanentlyDeleteHighlight=onRequest({region:'us-central1',invoker:'public',cors:true,timeoutSeconds:60},async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{const bearer=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!bearer)throw Error('Sign in first.');const user=await getAuth().verifyIdToken(bearer,true);if(!user.email_verified||user.cameraSession)throw Error('Use your verified administrator account.');const {kind,ownerId,matchId,clipId}=req.body||{};if(!['club','field'].includes(kind)||![ownerId,matchId,clipId].every(valid))throw Error('Invalid clip reference.');const db=getFirestore();await authorised(db,user,kind,ownerId);const root=kind==='field'?'leagueVenues':'clubs',matchRef=db.doc(`${root}/${ownerId}/video_highlights/${matchId}`);const result=await removeClip(db,matchRef,clipId,{kind,ownerId,matchId});await matchRef.collection('deletions').doc(clipId).set({clipId,actorUid:user.uid,reason:'Administrator permanent deletion',at:FieldValue.serverTimestamp()});return res.json(result);}catch(e){return res.status(400).json({error:e.message||'Could not permanently delete this clip.'});}
});
async function closeWeek(db,matchRef,context,now=Date.now()){
 const {curateHighlights}=await import('./highlightCuration.mjs');
 await db.runTransaction(async tx=>{
  const [parent,raw,votes,archived,likes]=await Promise.all([tx.get(matchRef),tx.get(matchRef.collection('raw')),tx.get(matchRef.collection('votes')),tx.get(matchRef.collection('archived')),tx.get(matchRef.collection('likes'))]);
  if(parent.data()?.weeklyVotingClosed===true)return;
  const clips=raw.docs.map(d=>({...d.data(),id:d.id,clipId:d.id})).filter(c=>!isMemory(c));
  if(!clips.length||weeklyDeadline(clips,parent.data())>now)return;
  if(clips.length+archived.size>180)throw Error('This match requires paginated curation.');
  const ballot=Object.fromEntries(votes.docs.map(d=>[d.id,d.data()]));
  const approved=clips.filter(c=>c.status==='approved'||c.status==='archived');
  const counts={},unique=new Set(),priority={};for(const like of likes.docs){const l=like.data();if(!l.clipId||!l.userId)continue;const key=l.userId+'~'+l.clipId;if(unique.has(key))continue;unique.add(key);counts[l.clipId]=(counts[l.clipId]||0)+1;if(l.isAdmin===true||l.isModerator===true){const t=Date.parse(l.createdAtISO||l.createdAt||'');if(Number.isFinite(t))priority[l.clipId]=Math.min(priority[l.clipId]??Infinity,t);}}
  const selection=curateHighlights({highlights:approved.map(c=>({...c,votes:0})),votesByUser:ballot,...(likes.size?{voteCounts:counts}:{}),adminLikePriority:priority});
  const winnerIds=new Set(archived.docs.map(d=>d.id));
  for(const w of selection.winners||[]){winnerIds.add(w.clipId||w.id);tx.set(matchRef.collection('archived').doc(w.clipId||w.id),{...w,matchId:context.matchId,weeklyWinner:true,winnerCategory:w.archiveCategory,weeklyWinnerRank:w.archiveRank,weeklyVotingClosed:true,votingLocked:true,frozenWeeklyVoteCount:w.voteCount||0,weeklyVoteCount:w.voteCount||0,archived:true,status:'archived',archivedAtISO:new Date(now).toISOString(),archivedAt:new Date(now).toISOString(),updatedAtServer:FieldValue.serverTimestamp()},{merge:true});}
  for(const clip of clips){if(winnerIds.has(clip.clipId)){tx.set(matchRef.collection('raw').doc(clip.clipId),{weeklyVotingClosed:true,votingLocked:true},{merge:true});continue;}tx.set(matchRef.collection('cleanup_queue').doc(clip.clipId),{clipId:clip.clipId,storagePath:clip.storagePath||'',cleanupStatus:'permanent_delete_pending',reason:'Weekly voting closed; clip did not win',weeklyVotingClosed:true,at:FieldValue.serverTimestamp()},{merge:true});}
  tx.set(matchRef,{weeklyVotingClosed:true,weeklyVotingClosedAt:FieldValue.serverTimestamp()},{merge:true});
 });
 const queued=await matchRef.collection('cleanup_queue').where('weeklyVotingClosed','==',true).get();
 let failed=0;for(const item of queued.docs){try{await removeClip(db,matchRef,item.id,context,{protectWinner:true});}catch(e){failed++;console.error('Highlight cleanup retained for retry',item.ref.path,e.message);}}if(failed)throw Error('Some clips could not be deleted. They are retained for retry; winners are safe.');
}
exports.closeHighlightWeek=onRequest({region:'us-central1',invoker:'public',cors:true,timeoutSeconds:180},async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{const bearer=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1];if(!bearer)throw Error('Sign in first.');const user=await getAuth().verifyIdToken(bearer,true);if(!user.email_verified||user.cameraSession)throw Error('Use your verified administrator account.');const {kind,ownerId,matchId}=req.body||{};if(!['club','field'].includes(kind)||![ownerId,matchId].every(valid))throw Error('Invalid weekly highlight reference.');const db=getFirestore();await authorised(db,user,kind,ownerId);const ref=db.doc(`${kind==='field'?'leagueVenues':'clubs'}/${ownerId}/video_highlights/${matchId}`);const [raw,parent]=await Promise.all([ref.collection('raw').get(),ref.get()]);if(!parent.data()?.weeklyVotingClosed&&weeklyDeadline(raw.docs.map(d=>d.data()),parent.data())>Date.now())throw Error('Weekly voting is still open. Winners are selected after five days.');await closeWeek(db,ref,{kind,ownerId,matchId});return res.json({closed:true});}catch(e){return res.status(400).json({error:e.message||'Could not close weekly voting.'});}
});
exports.closeWeek=closeWeek;
exports.processHighlightRetention=onSchedule({schedule:'every 30 minutes',region:'us-central1',timeoutSeconds:540,memory:'512MiB',maxInstances:1},async()=>{
 const db=getFirestore(),cursorRef=db.doc('systemJobs/highlightRetention'),cursor=(await cursorRef.get()).data()?.cursor;
 let query=db.collectionGroup('raw').orderBy(FieldPath.documentId()).limit(500);if(cursor)query=query.startAfter(db.doc(cursor));
 const batch=await query.get(),matches=new Map();
 for(const clip of batch.docs){const match=clip.ref.path.match(/^(clubs|leagueVenues)\/([^/]+)\/video_highlights\/([^/]+)\/raw\/[^/]+$/);if(!match)continue;const context={kind:match[1]==='clubs'?'club':'field',ownerId:match[2],matchId:match[3]};matches.set(clip.ref.parent.parent.path,{ref:clip.ref.parent.parent,context});}
 for(const {ref,context}of matches.values())try{await closeWeek(db,ref,context);}catch(e){console.error('Highlight retention failed',ref.path,e.message);}
 await cursorRef.set({cursor:batch.size===500?batch.docs.at(-1).ref.path:null,at:FieldValue.serverTimestamp()});
});
