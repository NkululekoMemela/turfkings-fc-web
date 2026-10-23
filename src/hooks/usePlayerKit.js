import {useEffect,useState} from "react";
import {collection,doc,onSnapshot} from "firebase/firestore";
import {db,auth,getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";
import {buildKitRoster} from "../core/playerKit.js";
export function useFootballProfiles(teams,clubId) {
  const clubs = [...new Set((teams || []).map(team=>team.clubId || clubId).filter(Boolean))].sort();
  const key = JSON.stringify(clubs);
  const [loaded,setLoaded]=useState({key:"",byClub:{}});
  useEffect(()=>{
    const byClub={},colours={};setLoaded({key,byClub:{}});
    const stops=JSON.parse(key).flatMap(id=>[onSnapshot(doc(db,"clubs",id),snap=>{colours[id]=snap.data()||{};if(byClub[id]){byClub[id]=byClub[id].map(player=>({...player,clubHomeColor:colours[id].homeColor||"",clubAwayColor:colours[id].awayColor||""}));setLoaded({key,byClub:{...byClub}});}}),onSnapshot(collection(db,"clubs",id,"publicPlayers"),snap=>{
      byClub[id]=snap.docs.map(item=>({...item.data(),id:item.id,clubId:id,clubHomeColor:colours[id]?.homeColor||"",clubAwayColor:colours[id]?.awayColor||""}));
      setLoaded({key,byClub:{...byClub}});
    },()=>{byClub[id]=[];setLoaded({key,byClub:{...byClub}});})]);
    return()=>stops.forEach(stop=>stop());
  },[key]);
  return loaded.key===key?Object.values(loaded.byClub).flat():[];
}
export async function numberSheetId(scope,matchKey) {
  const value=JSON.stringify([scope.venueId?"field":"club",scope.venueId || scope.clubId,scope.seasonId || "",matchKey]);
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,"0")).join("");
}
export function useMatchNumberSheet(scope,matchKey) {
  const key=JSON.stringify([scope,matchKey]);
  const [loaded,setLoaded]=useState({key:"",sheet:null,error:""});
  useEffect(()=>{
    let active=true,stop=()=>{};setLoaded({key,sheet:null,error:""});
    if(scope.environment==="practice" || !matchKey)return()=>{active=false;};
    numberSheetId(scope,matchKey).then(id=>{
      if(!active)return;
      stop=onSnapshot(doc(db,"matchNumberSheets",id),snap=>{if(active)setLoaded({key,sheet:snap.exists()?snap.data():null,error:""});},error=>{if(active)setLoaded({key,sheet:null,error:error.message});});
    }).catch(error=>{if(active)setLoaded({key,sheet:null,error:error.message});});
    return()=>{active=false;stop();};
  },[key]);
  return loaded.key===key?loaded:{sheet:null,error:""};
}
export async function verifyPlayerKit({scope,matchKey,teams,expectedRevision}) {
  const user=auth.currentUser;
  if(!user?.uid || !user.emailVerified)throw new Error("Sign in as the referee to verify player numbers.");
  const token=await user.getIdToken();
  const response=await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/verifyMatchPlayerNumbers`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({scope,matchKey,teams,expectedRevision})});
  const result=await response.json();
  if(!response.ok || result.error)throw new Error(result.error || "The number sheet could not be verified.");
  if(auth.currentUser?.uid!==user.uid)throw new Error("Your signed-in account changed.");
  return result;
}
export function teamNumbersFromProfiles(teams,profiles){return buildKitRoster(teams,profiles);}
