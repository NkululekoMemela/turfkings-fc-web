import React, {useEffect, useRef, useState} from "react";
import {ChallengePair} from "./ClubChallengeInbox.jsx";

const keyFor = (uid, clubId, notice) => `fanm:exhibition:${uid}:${clubId}:${notice.fixtureId}:${notice.type}:${notice.at}`;

export function markExhibitionPushOpened(userId, data) {
  const type = String(data.type || "").replace("club_exhibition_", "");
  const at = Number(data.eventAtMs);
  if (!Number.isSafeInteger(at) || at <= 0) return;
  try {localStorage.setItem(keyFor(userId, data.clubId, {fixtureId:data.fixtureId,type,at}), "1");} catch {}
}

export default function ExhibitionPlayerNotice({notices, clubId, userId, onSignup}) {
  const seen = useRef(new Set());
  const dialog = useRef(null);
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (active?.clubId === clubId && active?.userId === userId) return;
    for (const notice of notices || []) {
      const key = keyFor(userId, clubId, notice);
      if (seen.current.has(key)) continue;
      try {if (localStorage.getItem(key)) continue;} catch {}
      seen.current.add(key);
      try {localStorage.setItem(key, "1");} catch {}
      setActive({notice, clubId, userId});
      return;
    }
    if (active) setActive(null);
  }, [notices, clubId, userId, active]);
  const notice = active?.clubId === clubId && active?.userId === userId ? active.notice : null;
  useEffect(() => {if (notice && !dialog.current?.open) dialog.current?.showModal();}, [notice]);
  if (!notice) return null;
  const close = () => setActive(null);
  const date = new Intl.DateTimeFormat("en-ZA", {weekday:"short", day:"numeric", month:"short", timeZone:"Africa/Johannesburg"})
    .format(new Date(notice.kickoffMs));
  return <dialog ref={dialog} className="club-challenge-dialog tk-admin-notification-card exhibition-player-notice"
    aria-labelledby="exhibition-player-title" onCancel={(event) => {event.preventDefault(); close();}}>
    <p className="exhibition-notice-eyebrow">CLUB EXHIBITION</p>
    <h2 id="exhibition-player-title">{notice.type === "accepted" ? "Challenge accepted" : notice.type === "restored" ? "The match is back on" : notice.type === "postponed" ? "New exhibition kickoff" : "Match cancelled"}</h2>
    <ChallengePair match={notice}/>
    <p>{date} · {notice.proposedKickoff} SAST · {notice.venue}</p>
    <p>{notice.type === "accepted" ? `Your captain accepted the challenge with ${notice.opponentName}. Go to Signups to book your spot.`
      : ["restored","postponed"].includes(notice.type) ? "Your existing booking still counts." : "Please don’t travel to the venue for this match."}</p>
    {notice.type !== "cancelled" && <button type="button" className="tk-admin-notification-primary" onClick={() => {close(); onSignup();}}>Go to Signups</button>}
    <button type="button" className="tk-admin-notification-nav-btn" onClick={close}>{notice.type === "cancelled" ? "Dismiss" : "Later"}</button>
  </dialog>;
}
