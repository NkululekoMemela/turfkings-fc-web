import React, {useEffect, useRef, useState} from "react";

export default function FieldTakeoverRequestButton({request, deviceId, onRequest, recoveryError}) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const locked = useRef(false);
  const mine = Boolean(deviceId && request?.requester?.deviceId === deviceId);
  const pending = mine && request?.status === "pending";
  const expires = Date.parse(request?.expiresAtISO);
  const started = Date.parse(request?.requestedAtISO);
  const timed = pending && Number.isFinite(expires) && Number.isFinite(started) && expires > started;
  const remaining = timed ? Math.max(0, expires - Math.max(now, started)) : 0;
  const progress = timed ? Math.min(100, 100 * (1 - remaining / (expires - started))) : 0;
  const busy = sending || (pending && !recoveryError);

  useEffect(() => {
    if (!timed) return undefined;
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(tick);
  }, [timed, expires]);

  async function requestTakeover() {
    if (locked.current || busy) return;
    locked.current = true;
    setSending(true);
    setError("");
    try {
      await onRequest();
    } catch (failure) {
      setError(failure.message || "Could not send the takeover request.");
    } finally {
      locked.current = false;
      setSending(false);
    }
  }

  const label = sending ? "Sending takeover request…"
    : busy ? (timed && remaining > 0 ? `Takeover pending · ${Math.ceil(remaining / 1000)}s` : "Taking over…")
    : "🥷 Request Takeover";
  const message = error || recoveryError || (mine && request?.status === "rejected" ? "The current referee declined your request." : "");
  return <div>
    <button type="button" className="secondary-btn" disabled={busy || !onRequest}
      aria-busy={busy} onClick={requestTakeover} style={{position:"relative", overflow:"hidden", minWidth:175}}>
      <span>{label}</span>
      {sending && !timed && <progress aria-hidden="true" style={{position:"absolute", insetInline:0, bottom:0, width:"100%", height:3}} />}
      {busy && timed && <span aria-hidden="true" style={{position:"absolute", insetInline:0, bottom:0, height:3, background:"#ffffff30"}}>
        <span style={{display:"block", height:"100%", width:`${timed ? progress : 0}%`, background:"#75ecff"}} />
      </span>}
    </button>
    {message && <p role="status" className="small">{message}</p>}
  </div>;
}
