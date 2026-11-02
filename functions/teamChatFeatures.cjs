const {shortName}=require("./notificationSender.cjs");
const emojis=["⚽","🔥","🧤","👏","😂","❤️","👍","👎","😩","🤯"];
const valid=value=>typeof value==="string"&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value);
const text=(value,max=2000)=>String(value||"").trim().slice(0,max);
function clipRoot(clubId,legacy){if(legacy&&clubId!=="turf-kings")throw Error("Choose a highlight from your own Club.");return legacy?"video_highlights":`clubs/${clubId}/video_highlights`;}
function clipData(snap,matchId,bucket,legacy,clubId){
 const clip=snap.data()||{};
 if(clip.deleted||clip.archived===true&&bucket==="raw"||clip.isPracticeMode||clip.dataScope?.environment==="practice")return null;
 const owner=clip.clubId||clip.activeClubId||clip.matchContext?.clubId;if(owner&&owner!==clubId)return null;
 const mediaUrl=clip.mediaUrl||clip.videoUrl||clip.downloadUrl||clip.fileUrl||clip.publicUrl||clip.previewUrl||clip.url||clip.uri||"";
 if(!/^https:\/\//i.test(mediaUrl))return null;
 return {id:snap.id,matchId,bucket,legacy:!!legacy,title:text(clip.label||clip.title||clip.clipTitle||"Video highlight",120),mediaUrl,type:text(clip.type||clip.tag||"highlight",60),playerName:text(clip.scorerName||clip.playerName||clip.goalScorer||clip.scorer,80),teamName:text(clip.teamName,80)};
}
async function highlights(db,clubId){
 const roots=[{path:clipRoot(clubId,false),legacy:false},...(clubId==="turf-kings"?[{path:clipRoot(clubId,true),legacy:true}]:[])];
 const results=[],parents=[];
 for(const root of roots){const matches=await db.collection(root.path).limit(40).get();for(const match of matches.docs)parents.push({root,match});}
 for(let start=0;start<parents.length;start+=6)await Promise.all(parents.slice(start,start+6).map(async({root,match})=>{
  await Promise.all(["raw","archived"].map(async bucket=>{
   const clips=await db.collection(`${root.path}/${match.id}/${bucket}`).limit(24).get();
   for(const snap of clips.docs){const clip=clipData(snap,match.id,bucket,root.legacy,clubId);if(clip)results.push({...clip,sortMs:Number(snap.data().createdAtMs)||snap.data().createdAt?.toMillis?.()||Date.parse(snap.data().createdAtISO||snap.data().archivedAtISO||"")||0});}
  }));
 }));
 return {highlights:results.sort((a,b)=>b.sortMs-a.sortMs).slice(0,40).map(clip=>{delete clip.sortMs;return clip;})};
}
async function extra({db,tx,body,path,clubId,members}){
 const result={};
 if(body.highlight){
  const h=body.highlight;if(!valid(h.id)||!valid(h.matchId)||!["raw","archived"].includes(h.bucket))throw Error("Choose a highlight from the attachment picker.");
  const snap=await tx.get(db.doc(`${clipRoot(clubId,h.legacy===true)}/${h.matchId}/${h.bucket}/${h.id}`));
  const clip=snap.exists?clipData(snap,h.matchId,h.bucket,h.legacy===true,clubId):null;
  if(!clip)throw Error("That highlight is no longer available. Choose another clip.");
  Object.assign(result,{attachmentType:"highlight",highlightId:clip.id,highlightMatchDayId:clip.matchId,highlightTitle:clip.title,highlightLabel:clip.title,highlightMediaUrl:clip.mediaUrl,highlightType:clip.type,highlightPlayerName:clip.playerName,highlightScorerName:clip.playerName,highlightTeamName:clip.teamName});
 }
 if(body.replyToId){
  if(!valid(body.replyToId))throw Error("Choose a message in this team chat.");
  const reply=await tx.get(db.doc(`${path}/messages/${body.replyToId}`));
  if(!reply.exists||reply.data().deleted)throw Error("That message is no longer available to reply to.");
  Object.assign(result,{replyToId:reply.id,replyToSenderName:text(reply.data().senderName,80),replyToText:text(reply.data().text||reply.data().highlightTitle||"Attachment",300)});
 }
 result.mentions=(Array.isArray(body.mentions)?body.mentions:[]).slice(0,20).map(id=>members.find(m=>m.id===id)).filter(Boolean).map(m=>({id:m.id,name:shortName(m)}));
 return result;
}
async function mutate({db,tx,path,user,body,canModerate}){
 if(!valid(body.messageId))throw Error("Choose a message in this team chat.");
 const ref=db.doc(`${path}/messages/${body.messageId}`),snap=await tx.get(ref);if(!snap.exists||snap.data().deleted)throw Error("This message is no longer available.");
 if(body.action==="react"){
  if(body.emoji!==""&&!emojis.includes(body.emoji))throw Error("Choose a reaction.");
  const reactions={...(snap.data().reactionsByUser||{})};
  if(body.emoji)reactions[user.uid]=body.emoji;else delete reactions[user.uid];
  tx.update(ref,{reactionsByUser:reactions});return {saved:true};
 }
 if(snap.data().senderUid!==user.uid&&!canModerate)throw Error("Only the sender or team captain can delete this message.");
 tx.update(ref,{text:"Message deleted",deleted:true,reactionsByUser:{},attachmentType:"",highlightId:"",highlightTitle:"",highlightLabel:"",highlightMediaUrl:"",highlightType:"",highlightPlayerName:"",highlightScorerName:"",highlightTeamName:"",replyToId:"",replyToSenderName:"",replyToText:"",mentions:[]});return {saved:true};
}
async function view({db,clubId,members,captainIds=[],messages}){
 const portraits=await Promise.all(members.map(async m=>({id:m.id,uid:m.uid||"",fullName:text(m.fullName||m.shortName,80),shortName:shortName(m),role:captainIds.includes(m.id)?"captain":"player",photoUrl:m.uid?await require("./notificationMedia.cjs").senderPortrait(db,clubId,m.uid):""})));
 return {members:portraits,messages:messages.docs.map(s=>{
  const d=s.data(),sender=portraits.find(m=>m.uid===d.senderUid);
  return {id:s.id,senderUid:d.senderUid,senderName:d.senderName,senderIsCaptain:d.senderIsCaptain===true,senderRole:d.senderIsCaptain?"captain":"player",senderPhotoUrl:sender?.photoUrl||"",text:d.text,createdAtMs:d.createdAtMs,deleted:d.deleted===true,reactionsByUser:d.reactionsByUser||{},mentions:d.mentions||[],replyToId:d.replyToId||"",replyToSenderName:d.replyToSenderName||"",replyToText:d.replyToText||"",attachmentType:d.attachmentType||"",highlightId:d.highlightId||"",highlightTitle:d.highlightTitle||"",highlightLabel:d.highlightLabel||"",highlightMediaUrl:d.highlightMediaUrl||"",highlightType:d.highlightType||"",highlightPlayerName:d.highlightPlayerName||"",highlightScorerName:d.highlightScorerName||"",highlightTeamName:d.highlightTeamName||""};
 }).reverse()};
}
module.exports={extra,mutate,view,highlights,emojis};
