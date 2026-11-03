import React from "react";
import TeamIdentityEditor from "./TeamIdentityEditor";
export default function SharedSquadPitchPreview({
  getSquadPreviewSlots,
  activeChallengeFixture,
  sourceTeams,
  resolvedHomeClubName,
  resolvedHomeClubLogo,
  resolvedAwayClubName,
  resolvedAwayClubLogo,
  isLockedClubChallengeTeam,
  getTeamTheme,
  playersPerSide,
  canEdit,
  setTeamIdentityTarget,
  isCurrentGuestOpponentTeam,
  getTeamIdentityVisual,
  playersById,
  handleCaptainChange,
  captainOptionsForTeam,
  handleTeamColorNameChange,
  TURF_KINGS_SLOT_ID,
  toTitleCase,
  displayShortOf,
  displayNameOf,
  handlePreviewSlotClick,
  handlePreviewRemovePlayer,
  getPreviewTeamName
}) {
    const slots = getSquadPreviewSlots();
    const isClubChallengePreview = Boolean(activeChallengeFixture);

    const getChallengePreviewMeta = (team) => {
      const originalIndex = sourceTeams.findIndex(
        (item) => String(item?.id || "") === String(team?.id || "")
      );

      if (originalIndex === 0) {
        return {
          clubId: activeChallengeFixture?.homeClubId || "",
          clubName: resolvedHomeClubName,
          clubLogo: resolvedHomeClubLogo,
        };
      }

      return {
        clubId: activeChallengeFixture?.awayClubId || "",
        clubName: resolvedAwayClubName,
        clubLogo: resolvedAwayClubLogo,
      };
    };

    const previewTeams = isClubChallengePreview
      ? [...sourceTeams].sort((a, b) => {
          const aLocked = isLockedClubChallengeTeam(a.id) ? 1 : 0;
          const bLocked = isLockedClubChallengeTeam(b.id) ? 1 : 0;
          return aLocked - bLocked;
        })
      : sourceTeams;

    return (
      <div className="squad-preview-grid">
        {previewTeams.map((team) => {
          const theme = getTeamTheme(team);
          const players = Array.isArray(team.players) ? team.players : [];
          const challengeMeta = getChallengePreviewMeta(team);
          const challengeClubName = challengeMeta.clubName;
          const challengeClubLogo = challengeMeta.clubLogo;
          const isLockedOpponentPreview = isLockedClubChallengeTeam(team.id);

          return (
            <div
              key={`preview-${team.id}`}
              className={`squad-preview-pitch-card${isLockedOpponentPreview ? " squad-preview-pitch-card--locked-opponent" : ""}`}
              style={{
                "--team-accent": theme.accent,
                "--team-accent-soft": theme.accentSoft,
                "--team-glow": theme.glow,
              }}
            >
              <div className="squad-preview-team-head">
                <span className="squad-preview-team-dot" />
                <div
                  style={{
                    width: "100%",
                    minWidth: 0,
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 150px)",
                    gap: "0.55rem",
                    alignItems: "start",
                  }}
                >
                  <div>
                    {isClubChallengePreview ? (
                      <div className="squad-preview-club-challenge-title">
                        {challengeClubLogo ? (
                          <img
                            src={challengeClubLogo}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                        <h4>{challengeClubName || getPreviewTeamName(team)}</h4>
                      </div>
                    ) : canEdit ? (
                      <button
                        type="button"
                        className="text-input squad-team-identity-button"
                        onClick={() => setTeamIdentityTarget(team.id)}
                        disabled={isCurrentGuestOpponentTeam(team)}
                      >
                        {getTeamIdentityVisual(team)}
                        <span>{team.label || "Choose team"}</span>
                      </button>
                    ) : (
                      <h4>{getPreviewTeamName(team)}</h4>
                    )}

                    <p style={{ marginTop: "0.35rem" }}>
                      {players.length}/{playersPerSide} selected
                    </p>
                  </div>

                  {canEdit ? (
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                      <select
                        className="text-input"
                        value={
                          team.captainId && playersById.has(team.captainId)
                            ? team.captainId
                            : ""
                        }
                        onChange={(event) =>
                          handleCaptainChange(team.id, event.target.value)
                        }
                        disabled={isLockedOpponentPreview || captainOptionsForTeam(team).length === 0}
                        title="Select captain"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      >
                        <option value="">Captain</option>
                        {captainOptionsForTeam(team).map((pid) => (
                          <option key={`preview-captain-${team.id}-${pid}`} value={pid}>
                            ⭐ {displayNameOf(pid)}
                          </option>
                        ))}
                      </select>

                      <TeamIdentityEditor
                        team={team}
                        colourName={
                          team.teamColorName ||
                          (team.id === TURF_KINGS_SLOT_ID
                            ? "Black"
                            : "White")
                        }
                        showName={false}
                        showAbbreviation={false}
                        showColour
                        compact
                        disabled={isLockedOpponentPreview}
                        onColourChange={(nextColour) =>
                          handleTeamColorNameChange(
                            team.id,
                            nextColour.teamColorName
                          )
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="squad-preview-mini-pitch">
                <div className="squad-preview-centre-circle" />
                <div className="squad-preview-half-line" />
                <div className="squad-preview-box top" />
                <div className="squad-preview-box bottom" />

                {slots.map((slot, index) => {
                  const pid = players[index];
                  const label = pid
                    ? isCurrentGuestOpponentTeam(team)
                      ? toTitleCase(pid)
                      : (displayShortOf(pid) || '').split(' ')[0]
                    : "Empty";

                  const isCaptain =
                    pid &&
                    team.captainId &&
                    playersById.has(team.captainId) &&
                    team.captainId === pid;

                  return (
                    <button
                      type="button"
                      key={`preview-slot-${team.id}-${index}`}
                      className={`squad-preview-position ${pid ? "has-player" : "is-empty"}`}
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      onClick={() => handlePreviewSlotClick(team.id, index)}
                      title={
                        isLockedOpponentPreview
                          ? "Opponent lineup is controlled by the other club"
                          : canEdit
                            ? "Tap to assign player"
                            : "Read-only preview"
                      }
                    >
                      <div className="squad-preview-shirt">
                        {pid ? String(label || "?").charAt(0).toUpperCase() : "+"}
                      </div>
                      <div className="squad-preview-label">
                        <strong>{label}{isCaptain ? " ⭐" : ""}</strong>
                        <span>{slot.label}</span>
                      </div>

                      {canEdit && pid && !isLockedOpponentPreview ? (
                        <div className="squad-preview-mini-actions">
                          <span
                            role="button"
                            tabIndex={0}
                            title="Remove player"
                            onClick={(event) => {
                              event.stopPropagation();
                              handlePreviewRemovePlayer(team.id, pid);
                            }}
                          >
                            ×
                          </span>
                        </div>
                      ) : null}
                    </button>
                  );
                })}

                {players.length > slots.length && (
                  <div className="squad-preview-extra-list">

                    {players.slice(slots.length).map((pid, extraIndex) => (
                      <button
                        type="button"
                        key={`preview-extra-${team.id}-${pid}-${extraIndex}`}
                        className="squad-preview-extra-player"
                        onClick={() => handlePreviewSlotClick(team.id, slots.length + extraIndex)}
                        disabled={isLockedOpponentPreview}
                      >
                        {String(displayShortOf(pid) || displayNameOf(pid) || '').split(' ')[0]}
                      </button>
                    ))}
                  </div>
                )}

                {canEdit && players.length >= playersPerSide && (
                  <button
                    type="button"
                    className="squad-preview-add-extra-btn"
                    onClick={() => handlePreviewSlotClick(team.id, players.length)}
                  >
                    + Extra\nplayer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );

}
