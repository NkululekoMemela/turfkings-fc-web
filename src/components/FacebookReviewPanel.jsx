import React from 'react';
export function FacebookMark(){return <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.026 4.388 11.02 10.125 11.927v-8.437H7.078v-3.49h3.047V9.413c0-3.026 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.972h-1.513c-1.49 0-1.956.931-1.956 1.887v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.093 24 18.099 24 12.073Z"/></svg>;}
export function FacebookReviewEntry({pending,onOpen}){
 const ready=Number(pending)>0;
 return <button type="button" className={`fb-review-entry${ready?' fb-review-entry--ready':''}`} title={ready?`${pending} posts awaiting your review`:'Review Facebook highlights'} aria-label={ready?`Facebook highlights, ${pending} posts awaiting approval`:'Review Facebook highlights'} onClick={onOpen}><FacebookMark/>{ready&&<span className="fb-review-count" aria-hidden="true">{pending}</span>}</button>;
}
export default function FacebookReviewPanel({view,busy,error,notice,alertsEnabled,onRefresh,onConnect,onAlerts,onClose,children}){
 const pending=view?.items?.filter(item=>item.status==='pending').length||0;
 return <section className="fb-review" role="dialog" aria-modal="true" aria-labelledby="fb-review-title">
  <div className="fb-review-header"><span className="fb-review-brand"><FacebookMark/></span><div className="fb-review-heading"><small>YOUR PRIVATE WORKSPACE</small><h2 id="fb-review-title">Facebook highlights</h2><p>Great football. Your final say.</p></div><button type="button" className="fb-review-close" onClick={onClose} aria-label="Close Facebook review" title="Close"><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
  <div className="fb-review-tools" role="group" aria-label="Facebook review tools"><button type="button" disabled={busy} onClick={onRefresh}><span aria-hidden="true">↻</span>Refresh</button><button type="button" disabled={busy} onClick={onConnect}><span aria-hidden="true">↗</span>Check connection</button><button type="button" disabled={busy} onClick={onAlerts} className={alertsEnabled?'is-on':''}><span aria-hidden="true">{alertsEnabled?'✓':<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8a5 5 0 0 1 10 0v4l2 2H3l2-2V8ZM8 17h4"/></svg>}</span>{alertsEnabled?'Alerts on':'Phone alerts'}</button></div>
  <div className="fb-review-body">
   {error&&<div className="fb-review-message is-error" role="alert">{error}</div>}{notice&&<div className="fb-review-message is-success" role="status">{notice}</div>}
   {busy&&<div className="fb-review-working" role="status"><span/>Working…</div>}
   {view&&<div className="fb-review-status"><span className="fb-review-queue-label">{pending>0?`${pending} awaiting review`:'Review queue'}</span><span className={`fb-review-mode${view.liveEnabled?' is-live':''}`}>{view.liveEnabled?'Publishing enabled':'Test mode · publishing off'}</span></div>}
   {view?.discovery?.more&&<p role="status">Finding existing voted winners…</p>}
   {view?.items?.length===0&&!busy&&!view?.discovery?.more&&<div className="fb-review-empty"><div className="fb-review-play" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 32 32" fill="none"><rect x="3" y="5" width="26" height="22" rx="6" stroke="currentColor" strokeWidth="1.5"/><path d="m13 11 8 5-8 5V11Z" fill="currentColor"/></svg></div><small>THE NEXT GREAT MOMENT IS COMING</small><h3>You’re all caught up</h3><p>Winning goals will arrive here with a clip and caption for you to review.</p><div className="fb-review-next"><b>Ready for your first check?</b><span>Tap <strong>Check connection</strong> above to verify your Facebook Page.</span></div></div>}
   {children}
  </div>
  <div className="fb-review-footer"><span aria-hidden="true">✓</span>Only your approval publishes a post.</div>
 </section>;
}
