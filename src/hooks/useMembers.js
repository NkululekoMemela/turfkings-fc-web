import {useEffect,useState} from "react";
import {subscribeClubMemberDirectory} from "../storage/clubMemberDirectory.js";
export function useMembers(clubId="turf-kings") {
  const [loaded,setLoaded]=useState({clubId:null,members:[]});
  useEffect(()=>subscribeClubMemberDirectory(clubId,snapshot=>{
    const members=snapshot.docs.map(item=>({...item.data(),id:item.id})).sort((a,b)=>String(a.fullName||"").localeCompare(String(b.fullName||"")));
    setLoaded({clubId,members});
  },()=>setLoaded({clubId,members:[]})),[clubId]);
  return loaded.clubId===clubId?loaded.members:[];
}
