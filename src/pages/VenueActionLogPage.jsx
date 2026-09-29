import React, { useEffect, useState } from "react";
import {
  collection, collectionGroup, doc, getDoc, getDocs, onSnapshot,
  query, where,
} from "firebase/firestore";
import { db } from "../firebaseConfig.js";

const ACTION_COLORS = {
  season_created: "#38bdf8",
  season_started: "#3b82f6",
  match_started: "#3b82f6",
  match_completed: "#a78bfa",
  match_day_saved: "#22c55e",
  match_day_discarded: "#ef4444",
  season_ended: "#facc15",
  empty_season_deleted: "#fb7185",
};

export default function VenueActionLogPage({ venueId, onBack }) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState("");
  const [actorProfiles, setActorProfiles] = useState({});

  useEffect(() => {
    if (!venueId) return undefined;
    return onSnapshot(
      collection(db, "leagueVenues", venueId, "actionLog"),
      (snapshot) => {
        setEntries(snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((entry) =>
            (entry.at?.toMillis?.() || 0) >=
            Date.now() - 7 * 24 * 60 * 60 * 1000
          )
          .sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0)));
        setError("");
      },
      (cause) => setError(cause?.message || "Could not load Action Log.")
    );
  }, [venueId]);

  useEffect(() => {
    if (!venueId || !entries.length) return undefined;
    let cancelled = false;

    async function loadNames() {
      const venueSnapshot = await getDoc(doc(db, "leagueVenues", venueId));
      const venue = venueSnapshot.data() || {};
      const profiles = {};

      await Promise.all([...new Map(entries
        .filter((entry) => entry.actorUid)
        .map((entry) => [entry.actorUid, entry])).values()]
        .map(async (entry) => {
          const uid = entry.actorUid;
          const email = String(entry.actorEmail || "").trim().toLowerCase();
          let name = "";
          let role = "";

          if (email) {
            try {
              const members = await getDocs(query(
                collectionGroup(db, "members"),
                where("email", "==", email)
              ));
              const matches = members.docs.map((item) => item.data());
              const member = matches.find((item) =>
                item.uid === uid || item.platformIdentityUid === uid
              ) || matches[0];
              name = String(member?.fullName || member?.name || "").trim();
            } catch (cause) {
              console.warn("[Action Log] Member lookup failed", cause);
            }
          }

          try {
            const staff = await getDoc(doc(
              db, "leagueVenues", venueId, "staff", uid
            ));
            const data = staff.data() || {};
            role = String(data.role || "").replace(/_/g, " ").trim();
            if (!name) {
              name = String(
                data.fullName ||
                [data.firstName, data.surname].filter(Boolean).join(" ") ||
                data.name || ""
              ).trim();
            }
          } catch (cause) {
            console.warn("[Action Log] Staff lookup failed", cause);
          }

          if (venue.ownerUid === uid) {
            role = role || "Field Manager";
            const managerName = String(
              [venue.managerContact?.firstName,
                venue.managerContact?.surname].filter(Boolean).join(" ") ||
              venue.managerContact?.name || ""
            ).trim();
            if (!name || name === entry.actorName ||
                name === venue.createdByName) {
              name = managerName || name;
            }
          }

          profiles[uid] = {
            name: name || String(entry.actorName || "").trim(),
            role: role || "Field staff",
          };
        }));

      if (!cancelled) setActorProfiles(profiles);
    }

    loadNames().catch((cause) => {
      console.error("[Action Log] Name lookup failed", cause);
    });
    return () => { cancelled = true; };
  }, [venueId, entries]);

  return (
    <main className="venue-stats-page">
      <header className="venue-stats-header">
        <h1>Action Log</h1>
        <button type="button" className="secondary-btn" onClick={onBack}>
          Back to Field
        </button>
      </header>
      <section className="venue-stats-card">
        <p>Major Field and match actions, including who performed them.</p>
        {error && <p className="error-text" role="alert">{error}</p>}
        {!error && entries.length === 0 && <p>No actions recorded yet.</p>}
        {entries.map((entry, index) => (
          <article key={entry.id} className="venue-stats-card"
            style={{
              borderLeft: `5px solid ${ACTION_COLORS[entry.action] || "#94a3b8"}`,
            }}>
            <strong style={{ color: ACTION_COLORS[entry.action] || "#e2e8f0" }}>
              #{entries.length - index} · {entry.label || entry.action || "Field action"}
            </strong>
            <p>
              <strong>{actorProfiles[entry.actorUid]?.name ||
                entry.actorName || "Field staff"}</strong>
              {" · "}
              {actorProfiles[entry.actorUid]?.role || "Field staff"}
            </p>
            <p>{entry.at?.toDate?.() ? entry.at.toDate().toLocaleString() : "Time unavailable"}</p>
            {entry.details && <p>{entry.details
              .replace(/; (referee UID|completed by UID):.*$/, "")
              .replace(/; day ID:.*$/, "")
              .replace(/^(\d+ completed match\(es\) removed):.*$/, "$1")
            }</p>}
            <details>
              <summary>Technical details</summary>
              <p>Account: {entry.actorEmail || "—"}</p>
              <p>User ID: {entry.actorUid || "—"}</p>
              <p>Season ID: {entry.seasonId || "—"}</p>
              {entry.fixtureId && <p>Fixture ID: {entry.fixtureId}</p>}
              {entry.details && <p>Original record: {entry.details}</p>}
            </details>
          </article>
        ))}
      </section>
    </main>
  );
}
