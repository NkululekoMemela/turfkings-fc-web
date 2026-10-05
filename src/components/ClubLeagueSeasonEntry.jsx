import React, {useEffect, useRef, useState} from "react";
import LeagueSeasonInvitationPopup from "./LeagueSeasonInvitationPopup.jsx";
import {onAuthStateChanged} from "firebase/auth";
import {auth} from "../firebaseConfig.js";
import {loadClubLeagueSeason} from "../storage/clubLeagueSeasonLoader.js";

export default function ClubLeagueSeasonEntry({clubId, onOpen}) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [dismissed, setDismissed] = useState("");
  const responding = useRef(false);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    setEntry(null); setError("");
    async function load(user) {
      const request = ++generation;
      setEntry(null); setError("");
      if (!user || !clubId) return;
      try {
        const loaded = await loadClubLeagueSeason(clubId, user);
        if (!loaded) return;
        const {scope, season, view} = loaded;
        const link = {venueId: scope.venueId};
        if (disposed || request !== generation) return;
        const status = view.invitation?.invitationStatus;
        if (view.canManage) setEntry({label: "Official League Squad", icon: "🏆"});
        else if (status === "accepted") setEntry({label: "Official League Squad", icon: "🏆"});
        else if (status === "pending") setEntry({
          label: "Official League Squad", icon: "✉️",
          invitation: view.invitation,
          uid: user.uid,
          scope: {clubId, venueId: link.venueId, seasonId: season.id},
          seasonName: season.name || "League season",
          invitationKey: JSON.stringify([
            user.uid, clubId, link.venueId, season.id,
            view.invitation.memberId,
          ]),
        });
      } catch (failure) {
        if (!disposed && request === generation) setError(failure.message);
      }
    }
    const stop = onAuthStateChanged(auth, load);
    const refresh = () => {
      if (!responding.current) load(auth.currentUser);
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true; ++generation; stop();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [clubId, revision]);

  if (error) return (
    <div style={{gridColumn: "1 / -1"}}>
      <p role="alert" className="muted small">League access: {error}</p>
      <button type="button" className="secondary-btn"
        onClick={() => setRevision(value => value + 1)}>Retry league access</button>
    </div>
  );
  if (!entry) return null;
  return (
    <>
    {entry.invitation && entry.uid === auth.currentUser?.uid &&
      dismissed !== entry.invitationKey && (
      <LeagueSeasonInvitationPopup
        key={entry.invitationKey}
        invitation={entry.invitation}
        seasonName={entry.seasonName}
        scope={entry.scope}
        uid={entry.uid}
        onBusy={value => { responding.current = value; }}
        onLater={() => setDismissed(entry.invitationKey)}
        onResponded={() => {
          setDismissed(entry.invitationKey);
          setRevision(value => value + 1);
        }}
      />
    )}
    <button type="button" className="website-btn" onClick={onOpen}
      style={{
        minHeight: 48, width: "100%", display: "flex",
        alignItems: "center", justifyContent: "center", gap: 10,
        border: "1px solid rgba(167,139,250,.7)",
        background: "linear-gradient(135deg, #49307a, #251b43)",
        color: "#f5f3ff",
      }}>
      <span aria-hidden="true">{entry.icon}</span>
      <span>{entry.label}</span>
    </button>
    </>
  );
}
