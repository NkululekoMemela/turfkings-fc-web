import React from "react";
export default function GoogleSigninHelp({user,busy=false,onSwitchAccount}) {
 return <details className="google-signin-help" style={{marginTop:"0.85rem",padding:"0.85rem",border:"1px solid #94a3b8",borderRadius:14,background:"#f8fafc",color:"#0f172a"}}>
  <summary style={{cursor:"pointer",fontWeight:800}}>Wrong account or forgot your sign-in email?</summary>
  <p style={{color:"#334155"}}>Use the same Google account you registered with. It can use Gmail or another email provider.</p>
  {user?.email && <p style={{color:"#334155"}}>Your current Google account: <strong>{user.email}</strong></p>}
  {onSwitchAccount&&<button type="button" className="secondary-btn" disabled={busy} onClick={onSwitchAccount}>{busy?"Opening account selection…":"Choose another Google account"}</button>}
  <p><a style={{color:"#166534",fontWeight:800}} href="https://accounts.google.com/signin/usernamerecovery" target="_blank" rel="noopener noreferrer">Find my Google sign-in email</a></p>
  <p style={{color:"#334155"}}>Google can help using your recovery phone or email and your full name. If you still cannot recover access, speak privately to your club administrator about the next steps. Selecting a player name does not prove ownership; FANM does not reveal that profile’s email or replace its account from this screen.</p>
 </details>;
}
