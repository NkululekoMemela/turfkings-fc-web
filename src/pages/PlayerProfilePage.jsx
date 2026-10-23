import {canUsePlayerFeatures} from "../core/playerFeatureAccess.mjs";
import {buildPlayerProfileStory} from "../core/playerProfileStory.mjs";
import ProfileKitEditor from "../components/ProfileKitEditor.jsx";
import ProfileNumberStudio,{ProfileKitDisplay,useClubKit} from "../components/ProfileNumberStudio.jsx";
import React, {useEffect, useMemo, useRef, useState} from "react";
import {onIdTokenChanged} from "firebase/auth";
import {auth, signInWithGoogle} from "../firebaseConfig.js";
import {makePortraitPhotoDataUrl} from "../core/playerPortrait.js";
import {ownsPlayerProfile, parseJerseyNumber} from "../core/playerProfilePolicy.mjs";
import {buildPlayerProfileInsights} from "../core/playerProfileInsights.mjs";
import {cachedOwnPlayerProfile, loadOwnPlayerProfile, saveOwnPlayerProfile} from "../storage/playerProfileRepository.js";
import {confirmCurrentGoogleAccount, selectReplacementGoogleToken, replacePlayerGoogleAccount} from "../storage/playerGoogleAccountGateway.js";
import {usePlayerProfileReport} from "../hooks/usePlayerProfileReport.js";
import "./PlayerProfilePage.css";
const emptyDraft={fullName:"",shortName:"",email:"",whatsappNumber:"",jerseyNumber:"",ownsNumberedBib:"",bibColor:""};
function toDraft(member,session) {
  return {fullName:member?.fullName || "",shortName:member?.shortName || member?.fullName || "",
    email:session?.email || member?.email || "",whatsappNumber:member?.whatsappNumber || member?.phoneNumber || "",
    jerseyNumber:member?.jerseyNumber == null ? "" : String(member.jerseyNumber),
    ownsNumberedBib:member?.ownsNumberedBib == null ? "" : member.ownsNumberedBib ? "yes" : "no",ownsHomeShirt:member?.ownsHomeShirt?"yes":"no",ownsAwayShirt:member?.ownsAwayShirt?"yes":"no",additionalBibs:member?.additionalBibs||[],homeShirtColor:member?.homeShirtColor||"",awayShirtColor:member?.awayShirtColor||"",bibColor:member?.bibColor || ""};
}
const Pencil=()=> <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>;
export default function PlayerProfilePage({clubId,clubName="Your club",identity,user,activeRole,isPracticeMode=false,onBack,onProfileUpdated,onOpenShop}) {
  const club=useClubKit(clubId);
  const [session,setSession]=useState(()=>auth.currentUser);
  const playerAccess=canUsePlayerFeatures({user:session,identity,clubId,activeRole});
  const [initialProfile]=useState(()=>playerAccess?cachedOwnPlayerProfile(clubId,identity?.memberId):null);
  const [member,setMember]=useState(initialProfile),[draft,setDraft]=useState(()=>toDraft(initialProfile,auth.currentUser)),[photo,setPhoto]=useState(()=>initialProfile?.displayPhoto || initialProfile?.photoData || initialProfile?.photoUrl || auth.currentUser?.photoURL || "");
  const [newPhoto,setNewPhoto]=useState(""),[editing,setEditing]=useState(false),[loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState("");
  const [message,setMessage]=useState(""),[refresh,setRefresh]=useState(0),[headerScrolled,setHeaderScrolled]=useState(false);
  const [googleChange,setGoogleChange]=useState(null);
  const mode="LEAGUE";
  const photoRequest=useRef(0),dirty=useRef(false),googleContainer=useRef(null);
  const sessionIdentity=useRef(`${auth.currentUser?.uid || ""}:${auth.currentUser?.email || ""}`);
  const report=usePlayerProfileReport(playerAccess ? clubId : "",refresh);
  useEffect(()=>onIdTokenChanged(auth,current=>{
    setSession(current);
    const key=`${current?.uid || ""}:${current?.email || ""}`;
    if(key!==sessionIdentity.current){setMember(null);setEditing(false);setGoogleChange(null);setNewPhoto("");setPhoto("");dirty.current=false;sessionIdentity.current=key;}
  }),[]);
  useEffect(()=>{
    const scroll=()=>setHeaderScrolled(window.scrollY>12);scroll();
    window.addEventListener("scroll",scroll,{passive:true});return()=>window.removeEventListener("scroll",scroll);
  },[]);
  useEffect(()=>{
    if(!playerAccess){setMember(null);setPhoto("");setEditing(false);setGoogleChange(null);setLoading(false);dirty.current=false;return;}
    let active=true;const cached=cachedOwnPlayerProfile(clubId,identity?.memberId);setLoading(true);setMember(cached);setEditing(false);setError("");dirty.current=false;
    const fallback={fullName:identity?.fullName || user?.fullName || session?.displayName || "",shortName:identity?.shortName || user?.shortName || "",email:session?.email || ""};
    setDraft(cached?toDraft(cached,session):{...emptyDraft,...fallback});setPhoto(cached?.displayPhoto || cached?.photoData || cached?.photoUrl || session?.photoURL || "");setNewPhoto("");
    if (!session?.uid || !session.emailVerified) {setLoading(false);return;}
    loadOwnPlayerProfile(clubId,identity?.memberId).then(result=>{
      if (!active) return;
      if (!result) throw new Error("We could not link this profile to your signed-in account. Sign in again with your registered Google account.");
      setMember(result);setDraft(toDraft(result,session));setPhoto(result.displayPhoto || result.photoData || result.photoUrl || session.photoURL || "");
    }).catch(reason=>{if(active)setError(reason.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;photoRequest.current++;};
  },[clubId,session?.uid,session?.email,session?.emailVerified,identity?.memberId,refresh,playerAccess]);
  useEffect(()=>{
    const guard=event=>{if(dirty.current){event.preventDefault();event.returnValue="";}};
    window.addEventListener("beforeunload",guard);return()=>window.removeEventListener("beforeunload",guard);
  },[]);
  useEffect(()=>{
    if(!editing)return;
    const dock=document.querySelector(".profile-save-actions"),nav=document.querySelector(".tk-bottom-nav-flat");
    if(!dock)return;
    const position=()=>dock.style.setProperty("--profile-edit-bottom",`${(nav?.getBoundingClientRect().height||0)+12}px`);
    position();const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(position):null;
    if(nav)observer?.observe(nav);window.addEventListener("resize",position);
    return()=>{observer?.disconnect();window.removeEventListener("resize",position);};
  },[editing]);
  const changed=event=>{dirty.current=true;setMessage("");setDraft(current=>({...current,[event.target.name]:event.target.value}));};
  const choosePhoto=async event=>{
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){setError("Choose a JPG, PNG or WebP photo.");return;}
    if(file.size>15*1024*1024){setError("Choose a photo smaller than 15 MB.");return;}
    const request=++photoRequest.current;setPreparing(true);setError("");
    try{const prepared=await makePortraitPhotoDataUrl(file);if(request===photoRequest.current){setPhoto(prepared);setNewPhoto(prepared);dirty.current=true;}}
    catch(reason){if(request===photoRequest.current)setError(reason.message || "The photo could not be prepared.");}
    finally{if(request===photoRequest.current)setPreparing(false);}
  };
  const cancelEdit=()=>{if(saving||preparing)return;setDraft(toDraft(member,session));setPhoto(member?.displayPhoto || member?.photoData || member?.photoUrl || session?.photoURL || "");setNewPhoto("");setEditing(false);dirty.current=false;setError("");};
  const publish=details=>onProfileUpdated?.({memberId:member.id,uid:session.uid,...details});
  const save=async event=>{
    event.preventDefault();if(saving||preparing||!editing||!member||isPracticeMode)return;
    if(!playerAccess || !ownsPlayerProfile(member,auth.currentUser)){setError("Sign in as this player to edit your profile.");setEditing(false);return;}
    setSaving(true);setError("");setMessage("");
    try{
      const requestedEmail=draft.email.trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail))throw new Error("Enter a valid Google account email.");
      await saveOwnPlayerProfile({clubId,member,draft,photoData:newPhoto});
      publish({fullName:draft.fullName.trim(),shortName:draft.shortName.trim(),email:session.email,jerseyNumber:parseJerseyNumber(draft.jerseyNumber),...(newPhoto?{photoUrl:newPhoto}:{})});
      dirty.current=false;setEditing(false);setMessage("Your profile has been saved.");
      if(requestedEmail!==session.email.toLowerCase()){
        setMessage("Profile saved. Confirm your current Google account, then select your replacement Google account.");
        const proof=await confirmCurrentGoogleAccount();
        setGoogleChange({proof,email:requestedEmail,memberId:member.id});
      }
      setRefresh(value=>value+1);
    }catch(reason){setError(reason.message || "Your changes could not be saved.");}
    finally{setSaving(false);}
  };
  useEffect(()=>{
    if(!googleChange)return;
    const controller=new AbortController();let active=true;
    selectReplacementGoogleToken({originalGoogleIdToken:googleChange.proof.originalGoogleIdToken,container:googleContainer.current,signal:controller.signal})
      .then(async replacementGoogleIdToken=>{
        if(!active)return;setSaving(true);
        const result=await replacePlayerGoogleAccount({proof:googleChange.proof,replacementGoogleIdToken,requestedEmail:googleChange.email,clubId,memberId:googleChange.memberId});
        if(!active)return;
        setMessage(result.profileSyncPending?"Your new Google account is linked. Some club details still need to sync; reopen Profile and save to retry.":"Your sign-in Google account has been changed. Your player identity and match history have been preserved.");
        onProfileUpdated?.({memberId:googleChange.memberId,uid:result.uid,email:result.email});setGoogleChange(null);setRefresh(value=>value+1);
      }).catch(reason=>{if(active){setError(reason.message);setGoogleChange(null);}}).finally(()=>{if(active)setSaving(false);});
    return()=>{active=false;controller.abort();};
  },[googleChange,clubId]);
  const back=()=>{if(!saving&&(!dirty.current||window.confirm("Leave without saving your profile changes?")))onBack?.();};
  const seasons=report.state?.seasons || [];
  const season=seasons.find(item=>item.seasonId===report.state?.activeSeasonId) || null;
  const insights=useMemo(()=>buildPlayerProfileInsights({season:season||{},members:report.members,memberId:member?.id,mode,awards:[...(season?.profileSeasonAwards || []),...report.awards],leaders:report.leaders}),[season,report.members,member?.id,mode,report.awards,report.leaders]);
  const stats=insights.player;
  const story=useMemo(()=>buildPlayerProfileStory({insights,seasons,members:report.members,memberId:member?.id,awards:report.awards}),[insights,seasons,report.members,member?.id,report.awards]);
  const number=(()=>{try{return parseJerseyNumber(draft.jerseyNumber);}catch{return null;}})();
  const canEditProfile=Boolean(playerAccess && session?.uid && auth.currentUser?.uid===session.uid && ownsPlayerProfile(member,auth.currentUser));
  const disabled=!editing||saving||preparing||isPracticeMode||!canEditProfile;
  const field=(label,name,{type="text",...props}={})=><label className="field-row"><span>{label}</span>{editing?<input className="text-input" name={name} type={type} value={draft[name]} onChange={changed} disabled={disabled} {...props}/>:<strong className="profile-field-value">{draft[name] || "Not recorded"}</strong>}</label>;
  if(!playerAccess)return <main className="page player-profile-page"><section className="card"><h1>Player Profile</h1><p>Open your club as a verified player to view your profile. Player details are unavailable in spectator mode.</p><button type="button" className="primary-btn" onClick={onBack}>Back to Home</button></section></main>;
  if(!session?.uid || !session.emailVerified || auth.currentUser?.uid!==session.uid) return <main className="page player-profile-page">
    <div className="landing-header-sticky"><header className="header"><div className="profile-header-row"><div className="header-title"><h1>Player Profile</h1><div className="profile-header-club">{clubName}</div></div><button className="secondary-btn profile-home-button" type="button" onClick={onBack} aria-label="Home">🏠</button></div></header></div>
    <section className="card profile-signin-wall"><span className="profile-studio-eyebrow">PLAYER STUDIO</span><h2>Make your player card yours</h2><p className="muted">Sign in with your registered Google account to view and edit your personal profile.</p><button className="primary-btn" type="button" onClick={()=>signInWithGoogle().catch(reason=>setError(reason.message))}>Sign in with Google</button>{error&&<p className="error-text" role="alert">{error}</p>}</section>
  </main>;
  return <main className={`page player-profile-page${editing?" profile-is-editing":""}`}>
    <div className={`landing-header-sticky ${headerScrolled?"is-scrolled":""}`}><header className="header"><div className="profile-header-row">
      <div className="header-title"><h1>Player Profile</h1><div className="profile-header-club">{clubName}</div></div>
      <div className="profile-header-actions">
        <button type="button" className="secondary-btn profile-home-button" onClick={back} disabled={saving} aria-label="Home" title="Home">🏠</button></div>
    </div></header></div>
    {loading&&!member&&<p className="muted" role="status">Loading your FANM profile…</p>}
    {error&&<div className="card profile-alert" role="alert"><p className="error-text">{error}</p></div>}
    {!loading&&!member&&<div className="profile-signin"><button type="button" className="primary-btn" onClick={()=>signInWithGoogle().catch(reason=>setError(reason.message))}>Confirm your Google account</button></div>}
    {message&&<p className="success-text profile-message" role="status">{message}</p>}
    <form onSubmit={save}>
      <section className="card profile-summary profile-studio-card">
        <span className="profile-identity-number" aria-hidden="true">{number===null?"":String(number).padStart(2,"0")}</span>
        <span className="profile-studio-eyebrow">PLAYER STUDIO</span>
        {!editing&&<button type="button" className="secondary-btn profile-edit-button" aria-label="Edit profile" title="Edit profile" onClick={()=>{setEditing(true);setError("");setMessage("");}} disabled={loading||!canEditProfile||isPracticeMode||saving}><Pencil/></button>}
        <div className="profile-portrait-block"><div className="profile-portrait">{photo?<img src={photo} alt={draft.fullName||"Player portrait"}/>:<span>{(draft.shortName||draft.fullName||"P").slice(0,1).toUpperCase()}</span>}</div>
          {editing&&<label className="secondary-btn profile-photo-button">{preparing?"Preparing…":"Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={choosePhoto}/></label>}</div>
        <div className="profile-summary-copy">
          <h2>{draft.fullName||"Player profile"}</h2>
          <p className="profile-statement">{!report.loading&&!report.error&&insights.statements.filter(item=>item.tone==="achievement").slice(0,2).map(item=>item.text).join(" · ") || (stats?.gamesPlayed>0?`${stats.gamesPlayed} recorded match appearances`:report.loading?"Loading your football story…":"Your football record")}</p>{season&&<small className="muted">{season.label||`Season ${season.seasonNo||season.seasonId}`} · {mode==="LEAGUE"?"League":"Friendly"}</small>}
        </div><div className="profile-jersey" style={editing?{flexBasis:"100%",borderLeft:0,alignItems:"stretch"}:undefined}>{editing?<ProfileKitEditor draft={draft} club={club} disabled={disabled} onChange={next=>{dirty.current=true;setMessage("");setDraft(next);}}/>:<ProfileKitDisplay club={club} draft={draft} number={number} onOpenShop={onOpenShop}/>}</div>
      </section>
      <p className="muted profile-privacy-note">Contact and sign-in details: only you and club admins. Football details appear in squads and matches.</p>
      <div className="profile-form">
        <details className="card profile-personal profile-personal-fold" open={editing || undefined}><summary>Personal details</summary><div className="profile-fields">
          {field("Full name","fullName",{required:true,maxLength:100,autoComplete:"name"})}
          {field("Google account email","email",{required:true,type:"email",autoComplete:"email"})}
          {field("WhatsApp number","whatsappNumber",{type:"tel",maxLength:25,placeholder:"+27 …"})}
        </div>{editing&&<p className="muted profile-help">To change Google account, save your changes, confirm your current Google account, then select the new one. Your match history stays with your existing player identity.</p>}
        </details>
        <details className="card profile-account-fold"><summary>Profile <span className="muted">{member?.role || identity?.role || "Player"} · {member?.status || "Active"}</span></summary><dl className="profile-account-details"><div><dt className="muted">Club role</dt><dd>{member?.role||identity?.role||"Not recorded"}</dd></div><div><dt className="muted">Status</dt><dd>{member?.status||"Not recorded"}</dd></div><div><dt className="muted">Player ID</dt><dd>{member?.playerId||"Not recorded"}</dd></div></dl></details>
        {isPracticeMode&&<p className="muted">Switch to Official to edit your permanent player profile.</p>}
        {editing&&<div className="actions-row profile-save-actions" role="region" aria-label="Profile edit actions"><button type="button" className="secondary-btn" disabled={saving||preparing} onClick={cancelEdit}>Cancel</button><button type="submit" className="primary-btn" disabled={saving||preparing||!member||isPracticeMode}>{saving?"Saving…":"Save profile"}</button></div>}
      </div>
    </form>
    {member&&canEditProfile&&!isPracticeMode&&<ProfileNumberStudio clubId={clubId} member={member} club={club} onChanged={()=>{if(!dirty.current)setRefresh(value=>value+1);}}/>}
    {!report.loading&&!report.error&&(story.highlights.length>0||story.honours.length>0)&&<section className="card profile-football-story" aria-labelledby="profile-story-heading">
      <span className="profile-studio-eyebrow">ON THE PITCH</span><h2 id="profile-story-heading">My football story</h2>
        {season&&story.highlights.length>0&&<small className="muted">{season.label||`Season ${season.seasonNo||season.seasonId}`} · {mode==="LEAGUE"?"League":"Friendly"}</small>}
        {story.highlights.length>0&&<p className="profile-story-statement">{story.statement}</p>}
        {story.honours.length>0&&<div className="profile-honours"><h3>Honours</h3><ul>{story.honours.map(item=><li key={item.key}><span aria-hidden="true">🏆</span><div><strong>{item.title}</strong><small>{item.season} · {item.mode}</small></div></li>)}</ul></div>}
    </section>}
    {googleChange&&<div className="modal-backdrop"><section className="modal profile-google-modal" role="dialog" aria-modal="true" aria-labelledby="profile-google-title"><h2 id="profile-google-title">Confirm your replacement Google account</h2><p>Select <strong>{googleChange.email}</strong> to use it for FANM sign-in.</p><div ref={googleContainer}/><p className="muted">Confirm both Google accounts to keep the same player identity.</p><button type="button" className="secondary-btn" disabled={saving} onClick={()=>{setGoogleChange(null);setMessage("Your profile was saved. Your sign-in Google account was not changed.");}}>Cancel Google account change</button></section></div>}
  </main>;
}
