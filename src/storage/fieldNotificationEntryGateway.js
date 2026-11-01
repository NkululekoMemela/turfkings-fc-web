import {auth,app,activeFirebaseProjectId} from '../firebaseConfig.js';
import {getFirestore,doc,getDoc} from 'firebase/firestore/lite';
import {ownMembershipSnapshots} from './playerPrivacyGateway.js';
import {readPortalMembership,readPortalClub} from './clubFieldPortalReadClient.js';
import {claimApprovedVenueStaffProfile,ensureVenueCreatorStaffProfile} from './leagueVenueRepository.js';
import {fieldEntryMemoryKey,resolveFieldNotificationEntry} from '../core/fieldNotificationEntry.mjs';
export async function enterFieldFromNotification(venue,request){
 const user=auth.currentUser;
 if(!user?.uid||!user.emailVerified)throw Error('Sign in with your existing account to open this Field chat.');
 let remembered=null;
 try{remembered=JSON.parse(localStorage.getItem(fieldEntryMemoryKey(activeFirebaseProjectId,venue.id,user.uid))||'null');}catch{}
 const identity=await resolveFieldNotificationEntry({user,venue,request,remembered},{
  staff:async()=>{
   const current=await getDoc(doc(getFirestore(app),'leagueVenues',venue.id,'staff',user.uid));
   // An explicit revoked record must never be replaced by an older approved request.
   if(current.exists())return {...current.data(),uid:current.data().uid||user.uid};
   let selected='';try{selected=localStorage.getItem(`field-staff-profile:${venue.id}:${user.uid}`)||'';}catch{}
   if(selected&&selected!==user.uid){
    const prior=await getDoc(doc(getFirestore(app),'leagueVenues',venue.id,'staff',selected));
    if(prior.exists()&&prior.data().status==='active'&&String(prior.data().email||'').trim().toLowerCase()===String(user.email||'').trim().toLowerCase())return claimApprovedVenueStaffProfile({venueId:venue.id,requestId:selected});
   }
   if(venue.ownerUid===user.uid||venue.createdByUid===user.uid)return ensureVenueCreatorStaffProfile({venue,role:venue.creatorRole||'field_manager',name:venue.managerContact?.name||user.displayName||'Field Manager'});
   return null;
  },
  memberships:async()=>{
   const snapshot=await ownMembershipSnapshots();
   return snapshot.docs.map(d=>({...d.data(),id:d.id,clubId:d.ref.parent.parent.id}));
  },
  link:async clubId=>(await readPortalMembership(clubId)).data(),
  club:async clubId=>(await readPortalClub(clubId)).data(),
 });
 if(auth.currentUser?.uid!==user.uid||!auth.currentUser?.emailVerified)throw Error('Your signed-in account changed. Reopen the Field chat.');
 return identity;
}
