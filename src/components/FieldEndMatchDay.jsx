import React, {useState} from "react";
import {
  archiveVenueMatchDay, discardVenueMatchDay,
} from "../storage/leagueSeasonRepository.js";

export default function FieldEndMatchDay({
  venue, season: venueSeason, scope = null, canDiscard = false, onClose,
}) {
  if (scope && (scope.venueId !== venue?.id ||
      scope.seasonId !== venueSeason?.id)) {
    throw new Error("End Match Day requires the current Field season scope.");
  }
  const canEndFieldMatchDay = true;
  const [showEndMatchDayModal, setVisible] = useState(true);
  const [confirmEndMatchDay, setConfirmEndMatchDay] = useState(false);
  const [endingMatchDay, setEndingMatchDay] = useState(false);
  const [endMatchDayError, setEndMatchDayError] = useState("");
  const [showDiscardFieldDayConfirm, setShowDiscardFieldDayConfirm] = useState(false);
  const [discardFieldDayText, setDiscardFieldDayText] = useState("");
  const [discardingFieldDay, setDiscardingFieldDay] = useState(false);
  function setShowEndMatchDayModal(value) {
    setVisible(value);
    if (!value) onClose();
  }
  return <>
{showEndMatchDayModal && canEndFieldMatchDay && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true"
            aria-labelledby="field-end-day-title"
            style={{ width: "min(95vw, 780px)", maxWidth: "780px",
              maxHeight: "92vh", overflowY: "auto" }}>
            <h3 id="field-end-day-title">End Match Day</h3>
            <p>
              Review the completed matches, then save this match day to the
              server and clear the finished live board. Season standings
              and results remain available.
            </p>
            <p className="muted">
              Completed matches not yet archived: {
                (venueSeason?.results || []).filter((result) =>
                  result?.status === "completed" &&
                  !(venueSeason?.matchDayHistory || []).some((day) =>
                    (day.results || []).some((saved) =>
                      saved.fixtureId === result.fixtureId
                    )
                  )
                ).length
              }
            </p>
            {confirmEndMatchDay && (
              <>
                <p role="status">
                  Confirm saving these matches and clearing the finished
                  live board. This cannot be undone from here.
                </p>
                <ul>
                  {(venueSeason?.results || [])
                    .filter((result) =>
                      result?.status === "completed" &&
                      !(venueSeason?.matchDayHistory || []).some((day) =>
                        (day.results || []).some((saved) =>
                          saved.fixtureId === result.fixtureId
                        )
                      )
                    )
                    .map((result) => (
                      <li key={result.fixtureId || result.id}>
                        {result.teamAName || result.teamALabel ||
                          result.teamAId || "Team A"}
                        {" "}
                        {result.goalsA ?? result.scoreA ?? 0}
                        {"–"}
                        {result.goalsB ?? result.scoreB ?? 0}
                        {" "}
                        {result.teamBName || result.teamBLabel ||
                          result.teamBId || "Team B"}
                      </li>
                    ))}
                </ul>
              </>
            )}
            {endMatchDayError && (
              <p className="error-text" role="alert">{endMatchDayError}</p>
            )}
            <div className="actions-row" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "0.75rem",
            }}>
              {canDiscard && <button type="button" className="secondary-btn"
                style={{ background: "#a91f27", color: "#fff" }}
                disabled={endingMatchDay}
                onClick={() => {
                  setDiscardFieldDayText("");
                  setShowDiscardFieldDayConfirm(true);
                }}>
                Delete day's games
              </button>}
              <button type="button" className="secondary-btn"
                disabled={endingMatchDay}
                onClick={() => {
                  if (confirmEndMatchDay) setConfirmEndMatchDay(false);
                  else setShowEndMatchDayModal(false);
                }}>
                {confirmEndMatchDay ? "Back" : "Cancel"}
              </button>
              <button type="button" className="primary-btn"
                style={{
                  gridColumn: "1 / -1",
                  width: "100%",
                  minWidth: 0,
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                }}
                disabled={endingMatchDay}
                onClick={async () => {
                  if (endingMatchDay) return;
                  if (!confirmEndMatchDay) {
                    setConfirmEndMatchDay(true);
                    return;
                  }
                  setEndingMatchDay(true);
                  setEndMatchDayError("");
                  try {
                    await archiveVenueMatchDay({
                      scope,
                      venueId: venue?.id,
                      seasonId: venueSeason?.id,
                    });
                    setShowEndMatchDayModal(false);
                  } catch (error) {
                    setEndMatchDayError(
                      error?.message || "Could not end this match day."
                    );
                  } finally {
                    setEndingMatchDay(false);
                  }
                }}>
                {endingMatchDay
                  ? "Saving…"
                  : confirmEndMatchDay
                    ? "Confirm & Save to server"
                    : "Review & Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
{showDiscardFieldDayConfirm &&
        canDiscard && (
        <div className="modal-backdrop" style={{ zIndex: 10060 }}>
          <div className="modal" role="dialog" aria-modal="true"
            aria-labelledby="field-discard-day-title"
            style={{ width: "min(92vw, 520px)" }}>
            <h3 id="field-discard-day-title">
              Delete day's games
            </h3>
            <p>
              This removes unarchived completed Field games, their goals
              and events, and restores their fixtures to scheduled.
              Earlier archived match days remain saved.
            </p>
            <p className="error-text">
              Use this only for test games. To keep real results, go back
              and choose Save to server & clear.
            </p>
            <label htmlFor="field-discard-confirm">
              Type DELETE to confirm
            </label>
            <input id="field-discard-confirm" className="text-input"
              value={discardFieldDayText}
              onChange={(event) =>
                setDiscardFieldDayText(event.target.value)}
              autoComplete="off" />
            {endMatchDayError && (
              <p className="error-text" role="alert">
                {endMatchDayError}
              </p>
            )}
            <div className="actions-row">
              <button type="button" className="secondary-btn"
                disabled={discardingFieldDay}
                onClick={() => setShowDiscardFieldDayConfirm(false)}>
                Back
              </button>
              <button type="button" className="primary-btn"
                style={{ background: "#a91f27" }}
                disabled={discardingFieldDay ||
                  discardFieldDayText !== "DELETE"}
                onClick={async () => {
                  setDiscardingFieldDay(true);
                  setEndMatchDayError("");
                  try {
                    await discardVenueMatchDay({
                      scope,
                      venueId: venue.id,
                      seasonId: venueSeason.id,
                    });
                    setShowDiscardFieldDayConfirm(false);
                    setShowEndMatchDayModal(false);
                  } catch (error) {
                    setEndMatchDayError(
                      error?.message || "Could not delete these games."
                    );
                  } finally {
                    setDiscardingFieldDay(false);
                  }
                }}>
                {discardingFieldDay
                  ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          </div>
        </div>
      )}
  </>;
}
