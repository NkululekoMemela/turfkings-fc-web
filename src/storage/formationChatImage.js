import {ref,uploadString,getDownloadURL} from 'firebase/storage';
import {storage,auth} from '../firebaseConfig.js';
export async function uploadFormationChatImage(attachment,venueId){
 const user=auth.currentUser;
 if(!user?.emailVerified||attachment.venueId!==venueId||attachment.ownerUid!==user.uid)throw Error('Reopen this formation from your current Field account.');
 if(!/^[A-Za-z0-9_-]{1,150}$/.test(venueId)||!/^[A-Za-z0-9_-]{1,100}$/.test(attachment.clipId||""))throw Error("Invalid formation reference.");
 if(attachment.environment!=='official'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(attachment.imageData||'')||attachment.imageData.length>1300000)throw Error('This formation image cannot be shared.');
 const image=ref(storage,`leagueVenues/${venueId}/chatImages/${user.uid}/${attachment.clipId}.png`);
 let mediaUrl;
 try{mediaUrl=await getDownloadURL(image);}catch(error){
  if(error.code!=="storage/object-not-found")throw error;
  await uploadString(image,attachment.imageData,'data_url',{contentType:'image/png'});
  mediaUrl=await getDownloadURL(image);
 }
 if(auth.currentUser?.uid!==user.uid)throw Error('Your account changed. Reopen chat.');
 return {kind:'formation',venueId,clipId:attachment.clipId,matchId:attachment.matchId,title:attachment.title,mediaUrl};
}
