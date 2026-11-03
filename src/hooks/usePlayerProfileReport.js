import {useEffect, useState} from "react";
import {collection, onSnapshot} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {getClubStateDoc} from "../core/clubFirestorePaths.js";
import {loadClubArchivedHighlightsFromFirebase, loadCurrentAwardLeadersFromFirebase} from "../storage/VideoHighlightsRepository.js";
export function usePlayerProfileReport(clubId, refreshKey = 0) {
  const [report, setReport] = useState({state:null,members:[],awards:[],leaders:{},loading:true,error:"",awardError:""});
  useEffect(() => {
    if (!clubId) return;
    let active=true, stateReady=false, membersReady=false;
    setReport({state:null,members:[],awards:[],leaders:{},loading:true,error:"",awardError:""});
    const failed = error => { if (active) setReport(current => ({...current,loading:false,error:error.message || "Profile statistics could not be loaded."})); };
    const stateStop = onSnapshot(getClubStateDoc(db,clubId), snapshot => {
      if (!active) return; stateReady=true;
      setReport(current => ({...current,state:snapshot.data()?.state || null,loading:!membersReady}));
    },failed);
    const membersStop = onSnapshot(collection(db,"clubs",clubId,"publicMembers"), snapshot => {
      if (!active) return; membersReady=true;
      setReport(current => ({...current,members:snapshot.docs.map(item => ({...item.data(),id:item.id})),loading:!stateReady}));
    },failed);
    Promise.allSettled([loadClubArchivedHighlightsFromFirebase(clubId,{strict:true}),loadCurrentAwardLeadersFromFirebase(clubId)]).then(([archived,leaders]) => {
      if (!active) return;
      setReport(current => ({...current,awards:archived.status === "fulfilled" ? archived.value : [],
        leaders:leaders.status === "fulfilled" ? Object.fromEntries(["puskas","skill","save"].map(key => [key,leaders.value?.[key]])) : {},
        awardError:archived.status === "rejected" || leaders.status === "rejected" ? "Some video award records could not be loaded." : ""}));
    });
    return () => {active=false;stateStop();membersStop();};
  },[clubId,refreshKey]);
  return report;
}
