import { downloadFieldFixturePoster } from "../core/fieldFixturePoster.js";
import React, {useEffect, useRef, useState} from "react";
import "./FieldScheduleFixtures.css";

function ClubBadge({team, name}) {
  const logo = team?.transparentLogoUrl || team?.logoUrl || "";
  const [failed, setFailed] = useState("");
  return (
    <div className="field-fixture-club">
      <span className="field-fixture-badge">
        {logo && failed !== logo
          ? <img src={logo} alt="" loading="lazy" onError={() => setFailed(logo)} />
          : <span aria-hidden="true">{String(name || "?").slice(0, 2).toUpperCase()}</span>}
      </span>
      <strong>{name}</strong>
    </div>
  );
}

export function FieldFixtureCard({
  fixture, teams = [], season, venueName = "",
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  const timer = useRef(null);
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const lastExport = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const a = teams.find(team => team.id === fixture.clubAId);
  const b = teams.find(team => team.id === fixture.clubBId);
  const day = season?.matchDays?.find(item => item.id === fixture.matchDayId);
  const date = dateLabel(day?.dateLocal || fixture.scheduledLocal?.slice(0, 10));
  const live = season?.liveMatches?.[fixture.id]?.status === "live";
  const status = live ? "Live" : fixture.status === "completed" ? "Completed" :
    fixture.status === "cancelled" ? "Cancelled" : "";

  const exportFixture = async () => {
    if (saving.current || Date.now() - lastExport.current < 1200) return;
    saving.current = true;
    lastExport.current = Date.now();
    setBusy(true);
    setMessage("Preparing fixture image…");
    try {
      const result = await downloadFieldFixturePoster({
        season, teams, fixtureId: fixture.id, venueName,
      });
      setMessage(result?.cancelled ? "Save cancelled." :
        result?.location ? `Image saved · ${result.location}` : "Image downloaded.");
    } catch (failure) {
      setMessage(failure.message || "Could not save this fixture.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const cancelGesture = () => {
    clearTimeout(timer.current);
    gesture.current = null;
  };

  return (
    <article className="field-fixture-card" role="button" tabIndex={0}
      aria-label={`Download ${fixture.clubAName || a?.label || a?.name ||
        fixture.clubAId} versus ${fixture.clubBName || b?.label || b?.name ||
        fixture.clubBId} fixture image`}
      aria-busy={busy}
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        gesture.current = {
          x: event.clientX, y: event.clientY,
          pointerId: event.pointerId, fired: false,
        };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          if (!gesture.current) return;
          gesture.current.fired = true;
          lastTap.current = 0;
          exportFixture();
        }, 650);
      }}
      onPointerMove={event => {
        const start = gesture.current;
        if (start && Math.hypot(event.clientX - start.x,
            event.clientY - start.y) > 10) {
          cancelGesture();
          lastTap.current = 0;
        }
      }}
      onPointerUp={event => {
        const start = gesture.current;
        cancelGesture();
        if (!start || start.pointerId !== event.pointerId || start.fired) return;
        const now = Date.now();
        if (lastTap.current && now - lastTap.current < 350) {
          lastTap.current = 0;
          exportFixture();
        } else {
          lastTap.current = now;
        }
      }}
      onPointerCancel={() => {
        cancelGesture();
        lastTap.current = 0;
      }}
      onPointerLeave={cancelGesture}
      onDoubleClick={() => exportFixture()}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          exportFixture();
        }
      }}>
      <div className="field-fixture-meta">
        <span>{fixture.scheduledLocal?.slice(11, 16) || "Time TBC"} · SAST</span>
        <span>{date}</span>
      </div>
      <div className="field-fixture-pair">
        <ClubBadge team={a}
          name={fixture.clubAName || a?.label || a?.name || fixture.clubAId} />
        <span className="field-fixture-vs">VS</span>
        <ClubBadge team={b}
          name={fixture.clubBName || b?.label || b?.name || fixture.clubBId} />
      </div>
      {status && <p className={live ? "field-fixture-live" : "muted"}
        style={{fontSize: 11, textAlign: "center", marginBottom: 0}}>{status}</p>}
      {message && <p role="status" style={{
        fontSize: 12, textAlign: "center", overflowWrap: "anywhere",
      }}>{message}</p>}
    </article>
  );
}

const dateLabel = value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
      }).format(date)
    : "Date to be announced";
};

export default function FieldScheduleFixtures({
  season, teams = [], myClubId = "", venueName = "",
}) {
  const [downloading, setDownloading] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [error, setError] = useState("");
  const fixtures = season?.fixtures || [];
  const days = season?.matchDays || [];
  const ownClub = myClubId && (
    (season?.clubIds || []).includes(myClubId) ||
    fixtures.some(fixture =>
      [fixture.clubAId, fixture.clubBId].includes(myClubId))
  );
  const dateLabel = value => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-GB", {
          day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
        }).format(date)
      : "Date to be announced";
  };
  const name = id => teams.find(team => team.id === id)?.label ||
    teams.find(team => team.id === id)?.name ||
    season?.invitations?.[id]?.clubName || id;
  const download = async clubId => {
    if (downloading) return;
    setDownloading(clubId || "league");
    setError("");
    try {
      setDownloadMessage("");
      const result = await downloadFieldFixturePoster({season, teams, clubId, venueName});
      setDownloadMessage(result?.cancelled ? "Save cancelled." :
        result?.location ? `Image saved · ${result.location}` : "Image downloaded.");
    } catch (failure) {
      setError(failure.message || "Could not download fixtures.");
    } finally {
      setDownloading("");
    }
  };
  if (!season) return null;
  const publishedDays = new Set(days.map(day => day.id));
  const undated = fixtures.filter(fixture => !publishedDays.has(fixture.matchDayId));
  return (
    <div className="field-fixtures">
      {!!fixtures.length && (
        <div className="field-fixtures-download">
          <button type="button" className="secondary-btn field-fixtures-export"
            disabled={!!downloading} onClick={() => download("")}>
            {downloading === "league" ? "Saving…" : "All fixtures"}
          </button>
          {!!ownClub && (
            <button type="button" className="secondary-btn field-fixtures-export"
              disabled={!!downloading} onClick={() => download(myClubId)}>
              {downloading === myClubId
                ? "Saving…" : "My Club"}
            </button>
          )}
          <small className="muted" style={{flexBasis: "100%"}}>
            PNG fixture posters · SAST. Long press or double tap a fixture
            to download its individual match advert.
          </small>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {downloadMessage && <p role="status">{downloadMessage}</p>}
      {days.map(day => (
        <section key={day.id} style={{marginTop: 18}}>
          <h4 style={{marginBottom: 10}}>
            Match day {day.roundNo}
          </h4>
          {fixtures.filter(fixture => fixture.matchDayId === day.id)
            .sort((a, b) => String(a.scheduledLocal).localeCompare(String(b.scheduledLocal)))
            .map(fixture => (
              <FieldFixtureCard key={fixture.id}
                fixture={fixture} teams={teams} season={season} />
            ))}
          {!!day.byeClubIds?.length && (
            <p className="muted small">Bye: {day.byeClubIds.map(name).join(", ")}</p>
          )}
        </section>
      ))}
      {!!undated.length && (
        <section>
          <p className="muted small">
            Dates and kickoff times have not been published for these fixtures.
          </p>
          {undated.map(fixture => (
            <FieldFixtureCard key={fixture.id}
              fixture={fixture} teams={teams} season={season} />
          ))}
        </section>
      )}
      {!fixtures.length && (
        <p className="muted">The Field has not published its fixtures yet.</p>
      )}
    </div>
  );
}
