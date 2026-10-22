import {collection,doc,getDoc,onSnapshot} from "firebase/firestore";
import {onIdTokenChanged} from "firebase/auth";
import {auth,db} from "../firebaseConfig.js";
import {ownMembershipSnapshots,playerPrivacyRequest} from "./playerPrivacyGateway.js";
export function subscribeClubMemberDirectory(clubId,next,failed=()=>{}) {
  let generation=0,stops=[],disposed=false;
  const clear=()=>{stops.forEach(stop=>stop());stops=[];};
  const stopAuth=onIdTokenChanged(auth,async user=>{
    const request=++generation;clear();
    let publicDocs=[],ownDocs=new Map();
    const publish=()=>{
      if(disposed||request!==generation)return;
      const all=new Map(publicDocs.map(item=>[item.id,item]));
      ownDocs.forEach((value,key)=>all.set(key,value));
      next({docs:[...all.values()],forEach:fn=>[...all.values()].forEach(fn)});
    };
    // Drop data from the previous account immediately, including on sign-out.
    publish();
    try {
      const club=user?.emailVerified?(await getDoc(doc(db,"clubs",clubId))).data():null;
      if(disposed||request!==generation)return;
      const admin=Boolean(user?.emailVerified&&club&&([club.ownerUid,club.createdByUid,...(club.adminUids||[])].includes(user.uid)||(club.adminEmails||[]).some(email=>String(email).toLowerCase()===user.email?.toLowerCase())));
      if(admin){
        // Admin preparation is idempotent; public projections are also maintained by server triggers.
        playerPrivacyRequest({action:"prepare",clubId}).catch(failed);
        stops.push(onSnapshot(collection(db,"clubs",clubId,"members"),snapshot=>{publicDocs=snapshot.docs;publish();},failed));
      } else {
        stops.push(onSnapshot(collection(db,"clubs",clubId,"publicMembers"),snapshot=>{publicDocs=snapshot.docs;publish();},failed));
        if(user?.emailVerified){
          const owned=await ownMembershipSnapshots(clubId);
          if(disposed||request!==generation)return;
          for(const item of owned.docs){
            ownDocs.set(item.id,item);
            stops.push(onSnapshot(doc(db,"clubs",clubId,"members",item.id),snapshot=>{
              if(snapshot.exists())ownDocs.set(item.id,snapshot);else ownDocs.delete(item.id);publish();
            },failed));
          }
          publish();
        }
      }
    }catch(error){if(!disposed&&request===generation)failed(error);}
  });
  return()=>{disposed=true;generation++;clear();stopAuth();};
}
