import React, {useEffect, useState} from "react";
import {collection, onSnapshot} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {venueLeagueRootPath} from "../core/venueLeaguePaths.js";

export default function FieldPracticeBookings({scope, season, nextFixture, receiptCheck, onReceiptCheck}) {
  if (scope.environment !== "practice") throw Error("This view requires a Practice session.");
  const root = venueLeagueRootPath(scope);
  const dayId = nextFixture?.matchDayId;
  const key = dayId && season?.id ? `${root}/seasons/${season.id}/fieldMatchDayManifests/${dayId}/clubs` : "";
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!key) return undefined;
    return onSnapshot(collection(db, key), snapshot =>
      setLoaded({key, manifests: new Map(snapshot.docs.map(item => [item.id, item.data()]))}),
    () => setLoaded({key, error: true}));
  }, [key]);
  const manifests = loaded?.key === key ? loaded.manifests : null;
  const isBooked = manifest => manifest?.environment === "practice" && manifest?.simulated === true &&
    manifest?.practiceSessionId === scope.practiceSessionId && manifest?.seasonId === season?.id &&
    manifest?.matchDayId === dayId;
  const entryConfirmed = Boolean(nextFixture && receiptCheck?.seasonId === season?.id &&
    receiptCheck?.fixtureId === nextFixture.id);
  const invited = Object.values(season?.invitations || {});
  return (
    <section className="card practice-booking-review" data-practice-guide="field-bookings-review">
      <h2>Bookings &amp; Payments</h2>
      <p>Practice only. The bookings and squads below are simulated. No payments are collected.</p>
      <p>{nextFixture ? `Upcoming match day: ${nextFixture.scheduledLocal || dayId}`
        : season?.announcedAtMs ? "There is no upcoming match day yet." : "Announce a season to invite sandbox Clubs."}</p>
      {key && !manifests && <p role="status">{loaded?.key === key && loaded.error
        ? "Could not load the sandbox squads." : "Checking the sandbox squads…"}</p>}
      {nextFixture && <div>
        <h3>Club-to-Field entry</h3>
        <p>Rehearse recording an EFT or cash payment received by the Field. In Official, Field staff confirm the Club’s entry receipt and Club admins handle contributions from their own players.</p>
        <button type="button" className="secondary-btn" disabled={entryConfirmed}
          onClick={() => onReceiptCheck({seasonId:season.id,fixtureId:nextFixture.id})}>
          {entryConfirmed ? "Practice entry records confirmed" : "Record simulated receipt"}
        </button>
      </div>}
      <ul>{invited.map(item => {
        const manifest = manifests?.get(item.clubId);
        const booked = isBooked(manifest);
        return <li key={item.clubId}><strong>{item.clubName || item.clubId}</strong>
          <span>{item.status === "accepted" ? "Accepted" : "Awaiting acceptance"}
            {booked ? ` · Booked · ${manifest.confirmed ? "Squad confirmed" : "Squad pending"}`
              : manifests ? " · No booking for this day" : ""}</span>
        </li>;
      })}</ul>
    </section>
  );
}
