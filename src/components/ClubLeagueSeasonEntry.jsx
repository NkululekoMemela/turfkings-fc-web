import React, {useEffect, useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {doc, getDoc} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import {getSeasonSquadView} from "../storage/fieldSeasonSquadRepository.js";

export default function ClubLeagueSeasonEntry({clubId, onOpen}) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    setEntry(null); setError("");
    async function load(user) {
      const request = ++generation;
      setEntry(null); setError("");
      if (!user || !clubId) return;
      try {
        const membership = await getDoc(doc(db, "clubFieldMemberships", clubId));
        const link = membership.data();
        if (link?.status !== "active" || !link.venueId) return;
        const field = await getDoc(doc(db, "leagueVenues", link.venueId));
        const season = field.data()?.league?.activeSeason;
        if (!season?.id || season.status !== "active" ||
            !season.clubIds?.includes(clubId)) return;
        const view = await getSeasonSquadView({
          clubId, venueId: link.venueId, seasonId: season.id,
        });
        if (disposed || request !== generation) return;
        const status = view.invitation?.invitationStatus;
        if (view.canManage) setEntry({label: "League squad", icon: "🏆"});
        else if (status === "accepted") setEntry({label: "My League", icon: "🏆"});
        else if (status === "pending") setEntry({label: "League invitation", icon: "✉️"});
      } catch (failure) {
        if (!disposed && request === generation) setError(failure.message);
      }
    }
    const stop = onAuthStateChanged(auth, load);
    const refresh = () => load(auth.currentUser);
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
  );
}
