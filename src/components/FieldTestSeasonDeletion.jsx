import React, {useEffect, useState} from "react";
import {doc, onSnapshot} from "firebase/firestore";
import {auth, db, getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";

export default function FieldTestSeasonDeletion({venueId, season}) {
  const [confirmation, setConfirmation] = useState("");
  const [confirmedTest, setConfirmedTest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState("");
  const [job, setJob] = useState(null);
  const name = String(season?.name || season?.id || "");

  useEffect(() => {
    if (!jobId || !venueId) return undefined;
    return onSnapshot(
      doc(db, "leagueVenues", venueId, "seasonDeletionJobs", jobId),
      snapshot => setJob(snapshot.exists() ? snapshot.data() : null),
      failure => setError(failure.message || "Could not check deletion progress.")
    );
  }, [venueId, jobId]);

  useEffect(() => {
    setConfirmation("");
    setConfirmedTest(false);
  }, [season?.id]);

  if (!season?.id) return null;
  return (
    <details style={{
      marginTop: 14, padding: 14, borderRadius: "0.9rem",
      border: "1px solid rgba(248,113,113,.55)",
    }}>
      <summary style={{cursor: "pointer", color: "#fca5a5", fontWeight: 800}}>
        Danger zone
      </summary>
      <h4>Delete active test season</h4>
      <p className="muted small">
        Permanently removes this season's fixtures, results, events, saved
        lineups, match-day history and supported season records, including
        season chat. Unpaid league bookings are removed. A fresh season is created.
      </p>
      <p className="muted small">
        The Field, Clubs, staff and other seasons are kept.
        Live games and confirmed league payments block deletion.
        An audit entry records the deletion.
      </p>
      {jobId && (
        <p role="status">
          {job?.status === "completed"
            ? "Test-season cleanup completed."
            : "Deletion accepted. Server cleanup is in progress."}
        </p>
      )}
      <form onSubmit={async event => {
        event.preventDefault();
        if (busy || confirmation !== name || !confirmedTest) return;
        const user = auth.currentUser;
        if (!user) {
          setError("Sign in as the Field creator.");
          return;
        }
        const selectedSeasonId = season.id;
        const selectedName = name;
        setBusy(true);
        setError("");
        try {
          const token = await user.getIdToken();
          const response = await fetch(
            `${getActiveFirebaseFunctionsBaseUrl().replace(/\/$/, "")}/deleteFieldTestSeason`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                venueId, seasonId: selectedSeasonId,
                confirmation: selectedName, confirmedTest: true,
              }),
            }
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Could not delete the test season.");
          }
          setJob(null);
          setJobId(result.jobId);
          setConfirmation("");
          setConfirmedTest(false);
        } catch (failure) {
          setError(failure.message || "Could not delete the test season.");
        } finally {
          setBusy(false);
        }
      }} style={{display: "grid", gap: 12}}>
        <p style={{marginBottom: 0}}>
          Selected season: <strong>{name}</strong>
          <br /><small className="muted">{season.id}</small>
          <br /><small className="muted">
            {(season.fixtures || []).length} fixtures ·
            {" "}{(season.results || []).length} results ·
            {" "}{(season.matchDayHistory || []).length} archived match days
          </small>
        </p>
        <label>
          Type the exact season name
          <input className="text-input" value={confirmation}
            autoComplete="off" disabled={busy}
            onChange={event => setConfirmation(event.target.value)} />
        </label>
        <label style={{display: "flex", alignItems: "flex-start", gap: 10}}>
          <input type="checkbox" checked={confirmedTest} disabled={busy}
            onChange={event => setConfirmedTest(event.target.checked)} />
          This is a test season and I want its records permanently removed.
        </label>
        <button type="submit" className="secondary-btn"
          style={{borderColor: "#f87171", color: "#fca5a5"}}
          disabled={busy || !confirmedTest || confirmation !== name}>
          {busy ? "Requesting deletion…" : "Permanently delete test season"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
