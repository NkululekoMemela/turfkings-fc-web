const {fixture}=require('./playerWorkflowFirestore.cjs');
function practicePublicFixture({count=3,players=8,fieldIds=[]}={}){
 const records={};for(let c=1;c<=count;c++){
  const id=`club${c}`;records[`clubs/${id}`]={name:`Existing Club ${c}`,logoUrl:'https://example.com/badge.png',ownerUid:'private-owner',adminEmails:['private@example.com']};
  for(let p=1;p<=players;p++)records[`clubs/${id}/publicPlayers/p${p}`]={fullName:`Player ${p} Club ${c}`,shortName:`Player ${p}`,status:'active',mentality:4,shooting:5,photoUrl:'https://example.com/photo.png',uid:'must-not-copy',email:'private@example.com',phone:'secret',jerseyNumber:22};
 }
 for(const id of fieldIds)records[`clubFieldMemberships/${id}`]={venueId:'field',status:'active'};
 const f=fixture(records),collection=f.db.collection,reads=[];
 f.db.collection=path=>{reads.push(path);if(/\/(players|members|playerPhotos)$/.test(path))throw Error('Private collection read: '+path);const q=collection(path);q.orderBy=()=>q;return q;};
 return {...f,reads};
}
module.exports={practicePublicFixture};
