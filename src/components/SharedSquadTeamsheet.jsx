import React from "react";
export default function SharedSquadTeamsheet({
  matchTeams,
  isClubChallengeTeamsheet,
  teamsheetCardRef,
  handleSaveTeamsheetCardAsImage,
  activeClubLogo,
  TURF_KINGS_LOGO_URL,
  activeClubName,
  teamsheetDisplayDateParts,
  getTeamTheme,
  getChallengeTeamLogo,
  getPreviewTeamName,
  getTeamIdentityVisual,
  resolveSquadTeamIdentity,
  displayNameOf,
  fieldTeamsheet = false,
}) {
    return (
      <div className="teamsheet-export-wrap">
        <div className="teamsheet-export-actions">
          <div>
            <h3>Upcoming game teamsheet</h3>
            <p className="muted small">
              Share this with the group after saving squads.
            </p>
          </div>

          <button
            type="button"
            className="secondary-btn"
            onClick={handleSaveTeamsheetCardAsImage}
          >
            Download team-sheet
          </button>
        </div>

        <div
          ref={teamsheetCardRef}
          className={`teamsheet-card${isClubChallengeTeamsheet ? " teamsheet-card--club-challenge" : ""}`}
        >
          <div className="teamsheet-card-head">
            <div className="teamsheet-card-club">
              <img
                src={(isClubChallengeTeamsheet && !fieldTeamsheet) ? "/pwa/icon-192.png" : activeClubLogo || TURF_KINGS_LOGO_URL}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <div>
                <span>{(isClubChallengeTeamsheet && !fieldTeamsheet) ? "5 Asides Near Me" : activeClubName || "Club"}</span>
                <small>{fieldTeamsheet ? "League matchday squads" : isClubChallengeTeamsheet ? "Exhibition Fixture Only" : "5 Asides Near Me"}</small>
              </div>
            </div>

            <div className="teamsheet-card-date">
              <strong>{teamsheetDisplayDateParts.dateLabel}</strong>
              {teamsheetDisplayDateParts.scheduleLabel && (
                <small>{teamsheetDisplayDateParts.scheduleLabel}</small>
              )}
            </div>
          </div>

          <div className="teamsheet-card-grid">
            {matchTeams.map((team, index) => {
              const theme = getTeamTheme(team);
              const players = Array.isArray(team.players) ? team.players : [];
              const challengeLogo = getChallengeTeamLogo(team, index);

              return (
                <div
                  key={`teamsheet-card-${team.id}`}
                  className="teamsheet-card-team"
                  style={{
                    "--team-accent": theme.accent,
                    "--team-glow": theme.glow,
                  }}
                >
                  <div className="teamsheet-card-team-head">
                    <div className="teamsheet-card-team-title">
                      {challengeLogo ? (
                        <img
                          src={challengeLogo}
                          alt=""
                          className="teamsheet-card-team-logo"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                      <div>
                        <h4 className="teamsheet-card-team-name-with-identity">
                          {getTeamIdentityVisual(team)}
                          <span className="teamsheet-card-team-name-stack">
                            <span>{getPreviewTeamName(team)}</span>
                            {resolveSquadTeamIdentity(team) ? (
                              <small>Fantasy 5s</small>
                            ) : null}
                          </span>
                        </h4>
                        {!fieldTeamsheet && (
                          <p>
                            Wear: <strong>{team.teamColorName || theme.colorName || "Team colour"}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="teamsheet-card-team-abbrev">
                      {resolveSquadTeamIdentity(team)?.abbr ||
                        team.abbrev ||
                        ""}
                    </span>
                  </div>

                  <ol>
                    {players.length ? (
                      players.map((pid) => (
                        <li key={`teamsheet-${team.id}-${pid}`}>
                          {displayNameOf(pid)}
                          {team.captainId === pid ? " (C)" : ""}
                        </li>
                      ))
                    ) : (
                      <li className="muted">No players selected</li>
                    )}
                  </ol>
                </div>
              );
            })}
          </div>        </div>
      </div>
    );

}
