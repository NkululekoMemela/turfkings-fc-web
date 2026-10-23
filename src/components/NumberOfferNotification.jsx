import React,{useEffect,useRef,useState} from "react";
import {onIdTokenChanged} from "firebase/auth";
import {auth} from "../firebaseConfig.js";
import {numberRequest} from "./ProfileNumberStudio.jsx";
export default function NumberOfferNotification({clubId,enabled,onOpen}){
 const [notice,setNotice]=useState(null),seen=useRef(new Set());
 useEffect(()=>{let active=true,timer;const stop=onIdTokenChanged(auth,user=>{clearInterval(timer);setNotice(null);if(!enabled||!clubId||!user?.emailVerified)return;const uid=user.uid;
  const check=()=>numberRequest({action:"inbox",clubId}).then(result=>{if(!active||auth.currentUser?.uid!==uid)return;const offer=result.offers.find(item=>["pending","accepted"].includes(item.status)&&(result.isAdmin||item.status==="pending"&&item.holderUid===uid)&&!seen.current.has(`${uid}:${item.id}:${item.updatedAtMs}`));if(offer)setNotice({...offer,key:`${uid}:${offer.id}:${offer.updatedAtMs}`});}).catch(()=>{});check();timer=setInterval(check,30000);
 });return()=>{active=false;clearInterval(timer);stop();};},[clubId,enabled]);
 if(!notice)return null;const close=()=>{seen.current.add(notice.key);setNotice(null);};
 return <aside className="number-offer-banner card" role="status" aria-label="Number offer notification"><h2>Club number request</h2><p>{notice.kind==="allocation"?`${notice.buyerName} requested available number #${notice.number}. Captain/admin approval is required. No transfer fee applies.`:<>{notice.buyerName} has offered {notice.quote.currency} {notice.quote.amount.toFixed(2)} for {notice.holderName}’s #{notice.number}.</>}</p><p>{notice.kind==="allocation"?"First come, first served. Review this request in Profile.":notice.status==="accepted"?"The holder accepted. Captain or admin must confirm payment before transfer.":"The holder is free to decline. Number ownership stays unchanged until acceptance and payment approval."}</p><div className="actions-row"><button type="button" className="secondary-btn" onClick={close}>Later</button><button type="button" className="primary-btn" onClick={()=>{close();onOpen();}}>Open Profile</button></div></aside>;
}
