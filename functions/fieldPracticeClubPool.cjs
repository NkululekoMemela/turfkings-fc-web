const {randomInt,createHash}=require('node:crypto');
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(value);
const active=club=>club&&club.deleted!==true&&club.visibility?.listed!==false&&club.isPrivate!==true&&!['deleted','inactive','suspended','removed'].includes(String(club.status||'active').toLowerCase());
function shuffle(rows,pick){const result=[...rows];for(let i=result.length-1;i>0;i--){const j=pick(i+1);if(!Number.isInteger(j)||j<0||j>i)throw Error('Invalid Practice selection.');[result[i],result[j]]=[result[j],result[i]];}return result;}
const colours=['#2563eb','#dc2626','#16a34a','#d97706','#9333ea','#0891b2'];
function publicClubCopy({clubId,club,documents,poolSource,index=0,pick=randomInt}){
 if(!safeId(clubId)||!active(club))return null;
 const names=new Set();
 const eligible=documents.filter(doc=>safeId(doc.id)&&doc.data().deleted!==true&&String(doc.data().status||'active').toLowerCase()==='active').map(doc=>({id:doc.id,data:doc.data()})).filter(({data})=>{
  const name=String(data.fullName||data.name||data.displayName||data.playerName||'').trim();const key=name.toLowerCase();if(!name||names.has(key))return false;names.add(key);return true;
 });
 if(eligible.length<6)return null;
 const color=colours[index%colours.length];
 const players=shuffle(eligible,pick).slice(0,6).map(({id,data},i)=>{
  const fullName=String(data.fullName||data.name||data.displayName||data.playerName).trim();
  const rating=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=5?Number(value):3;
  const photo=[data.photoUrl,data.photoData].find(value=>typeof value==='string'&&value.length<=65536)||'';
  return {sourcePlayerId:id,playerId:`${clubId}::${id}`,memberId:'sandbox-'+createHash('sha256').update(`${clubId}:${id}`).digest('hex').slice(0,24),clubId,fullName,shortName:String(data.shortName||fullName.split(' ')[0]),status:'active',mentality:rating(data.mentality),shooting:rating(data.shooting),photoData:photo,jerseyNumber:i+1,ownsNumberedBib:false,bibColor:color,matchBib:{source:'practice',number:i+1,color,available:true,assigned:true,simulated:true},environment:'practice',simulated:true};
 });
 const logo=[club.transparentLogoUrl,club.branding?.logoUrl,club.logoUrl,club.logo].find(v=>typeof v==='string'&&v.length<=65536)||'';
 return {clubId,sourceClubId:clubId,name:club.name||club.clubName||clubId,logoUrl:logo,homeColor:color,awayColor:'#f8fafc',environment:'practice',simulated:true,poolSource,captain:players[0].fullName,captainId:players[0].memberId,players};
}
async function loadPublicPracticeClubs({db,venueId,minimumClubs=3,pick=randomInt}){
 if(!safeId(venueId))throw Error('Choose a valid Field.');
 if(!Number.isInteger(minimumClubs)||minimumClubs<3||minimumClubs>6)throw Error('Practice supports three to six Clubs.');
 const links=await db.collection('clubFieldMemberships').where('venueId','==',venueId).get();
 const fieldIds=links.docs.filter(d=>d.data().status==='active'&&safeId(d.id)).map(d=>d.id).sort();
 const selected=[],seen=new Set();
 async function consider(clubId,club,poolSource){
  if(selected.length>=6||seen.has(clubId)||!safeId(clubId))return;seen.add(clubId);
  if(!active(club))return;
  const snapshot=await db.collection(`clubs/${clubId}/publicPlayers`).limit(60).get();
  const copy=publicClubCopy({clubId,club,documents:snapshot.docs,poolSource,index:selected.length,pick});if(copy)selected.push(copy);
 }
 for(const id of fieldIds){if(selected.length>=6)break;const snap=await db.doc(`clubs/${id}`).get();if(snap.exists)await consider(id,snap.data(),'field');}
 let cursor=null,scanned=0;
 while(selected.length<6&&scanned<300){
  let query=db.collection('clubs').orderBy('__name__').limit(50);if(cursor)query=query.startAfter(cursor);
  const page=await query.get();
  for(const doc of page.docs){await consider(doc.id,doc.data(),'platform');if(selected.length>=6)break;}
  scanned+=page.docs.length;if(page.docs.length<50)break;cursor=page.docs.at(-1);
 }
 if(selected.length<minimumClubs)throw Error(`Practice needs ${minimumClubs} existing Clubs with six published players each. Found ${selected.length}. No real invitations were sent.`);
 return selected;
}
module.exports={loadPublicPracticeClubs,publicClubCopy};
