import React, {useEffect, useState} from "react";
import {collection, onSnapshot} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import {archiveVenueMatchDay} from "../storage/leagueSeasonRepository.js";
import {buildDatedMatchDayArchive} from "../core/fieldMatchDayArchive.js";

export default function FieldMatchDayReview({venueId, season, onReviewStats}) {
  const [reviews, setReviews] = useState([]);
  const [dismissed, setDismissed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setReviews([]);
    if (!venueId || !season?.id) return undefined;
    return onSnapshot(
      collection(db, "leagueVenues", venueId, "seasons", season.id,
        "matchDayReviews"),
      snapshot => setReviews(snapshot.docs.map(item => ({
        ...item.data(), matchDayId: item.id,
      }))),
      failure => {
        console.error("[Field review]", failure);
        setReviews([]);
      }
    );
  }, [venueId, season?.id]);

  const ready = reviews.filter(review => {
    if (review.status !== "ready") return false;
    try {
      buildDatedMatchDayArchive({
        season, matchDayId: review.matchDayId, actorUid: "preview",
      });
      return true;
    } catch {
      return false;
    }
  }).sort((a, b) => a.readyAtMs - b.readyAtMs)[0];

  const key = ready ? [
    auth.currentUser?.uid, venueId, season.id, ready.matchDayId,
    ready.readyAtMs, ready.reminderSentAtMs ? "reminder" : "initial",
  ].join(":") : "";
  let previouslyDismissed = false;
  try {
    previouslyDismissed = Boolean(key && sessionStorage.getItem(key));
  } catch {}
  const openKey = ready
    ? `field-review-open:${venueId}:${season.id}:${ready.matchDayId}` : "";
  let explicitlyOpened = false;
  try {
    explicitlyOpened = Boolean(openKey && sessionStorage.getItem(openKey));
  } catch {}
  if (!ready || (!explicitlyOpened &&
      (dismissed === key || previouslyDismissed))) return null;

  const day = (season.matchDays || []).find(item => item.id === ready.matchDayId);
  const dismiss = () => {
    try {
      sessionStorage.setItem(key, "reviewed");
      sessionStorage.removeItem(openKey);
    } catch {}
    setDismissed(key);
  };

  return (
    <div className="modal-backdrop" style={{zIndex: 12000}}>
      <section className="modal" role="dialog" aria-modal="true"
        aria-labelledby="field-day-review-heading"
        style={{
          background: "linear-gradient(145deg, #101c35, #060b1d)",
          color: "#f1f5f9", border: "1px solid rgba(148,163,184,.25)",
          borderRadius: 20, padding: 24, width: "min(440px, 92vw)",
        }}>
        <h3 id="field-day-review-heading">
          {ready.reminderSentAtMs ? "Your match day is still open" : "Match day complete"}
        </h3>
        <p>All scheduled games for {day?.dateLocal || "this match day"} are finished.</p>
        <p>Review the stats and any reported mistakes before ending the match day.</p>
        <p className="muted small">
          If left open, it will close automatically at 23:59 SAST.
        </p>
        {error && <p role="alert" className="error-text">{error}</p>}
        <div className="actions-row" style={{flexWrap: "wrap", gap: 10}}>
          <button type="button" className="secondary-btn" autoFocus
            disabled={busy} onClick={() => {
              dismiss();
              onReviewStats?.();
            }}>Review Stats</button>
          <button type="button" className="primary-btn" disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await archiveVenueMatchDay({
                  venueId, seasonId: season.id, matchDayId: ready.matchDayId,
                });
                dismiss();
              } catch (failure) {
                setError(failure.message || "Could not end the match day.");
              } finally {
                setBusy(false);
              }
            }}>{busy ? "Saving…" : "End Match Day"}</button>
          <button type="button" className="secondary-btn"
            disabled={busy} onClick={dismiss}>Review Later</button>
        </div>
      </section>
    </div>
  );
}
