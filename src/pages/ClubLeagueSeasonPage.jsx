import LeagueMatchDaySubmission from "../components/LeagueMatchDaySubmission.jsx";
import SignupHeroHeader from "../components/SignupHeroHeader.jsx";
import useSignupPlayerPhotos from "../hooks/useSignupPlayerPhotos.js";
import useLeagueSignupAttendanceBadge from "../hooks/useLeagueSignupAttendanceBadge.js";
import LeagueSeasonMarkPaid from "../components/LeagueSeasonMarkPaid.jsx";
import FieldSeasonPayment from "../components/FieldSeasonPayment.jsx";
import "./ClubLeagueSeasonPage.css";
import {loadClubLeagueSeason} from "../storage/clubLeagueSeasonLoader.js";
import React, {useEffect, useMemo, useState} from "react";
import {onAuthStateChanged} from "firebase/auth";
import {doc, getDoc, getDocs, collection} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import {
  getSeasonSquadView, createSeasonSquad,
  respondSeasonInvitation, confirmSeasonPayment, setSeasonAvailability,
} from "../storage/fieldSeasonSquadRepository.js";

const money = cents => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR",
}).format(Number(cents) / 100);

export default function ClubLeagueSeasonPage({clubId, onBack, activeRole, identity, onOpenField, playerPhotosByName}) {
  const [user, setUser] = useState(null);
  const getPlayerPhoto = useSignupPlayerPhotos(clubId, playerPhotosByName);
  const [showLeagueCalendar, setShowLeagueCalendar] = useState(false);
  const [fixtureClubs, setFixtureClubs] = useState({});
  const [authReady, setAuthReady] = useState(false);
  const [context, setContext] = useState(null);
  const [view, setView] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [seasonPaymentOpen, setSeasonPaymentOpen] = useState(false);
  const [total, setTotal] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => onAuthStateChanged(auth, next => {
    setUser(next); setAuthReady(true);
  }), []);

  useEffect(() => {
    let disposed = false;
    setError("");
    if (!authReady) return undefined;
    if (!user || !clubId) {
      setContext(null); setView(null); setPlayers([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    async function load() {
      const loaded = await loadClubLeagueSeason(
        clubId, user, {force: revision > 0}
      );
      if (!loaded) {
        if (!disposed) {
          setContext(null); setView(null); setPlayers([]);
        }
        return;
      }
      const {scope, venue, season, view: result} = loaded;
      let directory = [];
      if (result.canManage && !result.squad &&
          ["admin", "captain", "super_admin", "superadmin"].includes(
            String(activeRole || "").trim().toLowerCase()
          )) {
        const [members, profiles] = await Promise.all([
          getDocs(collection(db, "clubs", clubId, "members")),
          getDocs(collection(db, "clubs", clubId, "players")),
        ]);
        const profileMap = new Map(profiles.docs.map(item => [item.id, item.data()]));
        directory = members.docs.flatMap(item => {
          const member = item.data();
          if ((member.status || "active") !== "active") return [];
          let playerId = member.playerId;
          if (!playerId) {
            const linked = profiles.docs.filter(profile =>
              profile.data().sourceMemberId === item.id);
            if (linked.length !== 1) return [];
            playerId = linked[0].id;
          }
          const profile = profileMap.get(playerId);
          if (!profile || (profile.status || "active") !== "active") return [];
          return [{
            memberId: item.id, sourcePlayerId: playerId,
            name: profile.fullName || profile.displayName ||
              profile.name || profile.playerName || member.playerId,
          }];
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
      if (!disposed) {
        setContext({scope, venue, season});
        setView(result); setPlayers(directory);
      }
    }
    load().catch(failure => {
      if (!disposed) setError(failure.message);
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => {disposed = true;};
  }, [clubId, user?.uid, authReady, revision, activeRole]);

  async function act(operation, details, success) {
    if (busy || !context) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await operation({...context.scope, ...details});
      setMessage(success);
      setRevision(value => value + 1);
    } catch (failure) {
      setError(failure.message || "Could not update your league squad.");
    } finally {setBusy(false);}
  }

  const publishedDates = context?.season?.schedulePublishedAtMs
    ? (context.season.matchDays || [])
      .map(day => day.dateLocal || day.date || day.dateKey)
      .filter(value => typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value))
      .sort()
    : [];
  const formatDay = value => new Intl.DateTimeFormat("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
  }).format(new Date(`${value}T12:00:00`));

  const canManageUi = Boolean(
    view?.canManage &&
    ["admin", "captain", "super_admin", "superadmin"].includes(
      String(activeRole || "").trim().toLowerCase()
    )
  );
  const squad = view?.squad;
  const invitation = view?.invitation;
  const amount = Number(total);
  const totalCents = Math.round(amount * 100);
  const entries = Object.values(squad?.entries || {});
  const games = (context?.season?.matchDays || []).flatMap(day => {
    const fixtures = (context.season.fixtures || []).filter(fixture =>
      fixture.matchDayId === day.id &&
      [fixture.clubAId, fixture.clubBId].includes(clubId));
    if (fixtures.length !== 1) return [];
    const fixture = fixtures[0];
    const archived = (context.season.matchDayHistory || []).some(item =>
      (item.scheduledMatchDayId || item.id) === day.id);
    return [{
      day, fixture,
      editable: day.status === "scheduled" &&
        fixture.status === "scheduled" && !archived &&
        !context.season.liveMatches?.[fixture.id],
    }];
  });
  const availabilityPlayers = view?.attendancePlayers ||
    (canManageUi ? entries.filter(entry => entry.invitationStatus === "accepted")
      : invitation?.invitationStatus === "accepted" ? [invitation] : []);

  const ownPhoto = getPlayerPhoto(invitation?.fullName ||
    identity?.fullName || identity?.displayName || "") ||
    identity?.photoUrl || user?.photoURL || "";
  const ownName = invitation?.fullName || identity?.fullName ||
    identity?.displayName || identity?.shortName || user?.displayName || "Player";

  const beneficiary = useMemo(() => ({
    ...identity,
    fullName: ownName,
    shortName: identity?.shortName || ownName.split(/\s+/)[0],
    playerId: invitation?.sourcePlayerId || identity?.playerId,
    isGuest: false,
  }), [identity, ownName, invitation?.sourcePlayerId]);
  const attendanceBadge = useLeagueSignupAttendanceBadge(beneficiary, clubId);
  const attendanceBadgeText = attendanceBadge.loading
    ? "Attendance loading..."
    : attendanceBadge.percent == null ? "Attendance not available"
    : `${attendanceBadge.percent}% attendance`;
  const attendanceSubtext = attendanceBadge.loading || attendanceBadge.percent == null
    ? "" : `${attendanceBadge.attended}/${attendanceBadge.total} weeks · ${
      attendanceBadge.gamesPlayed
    } games played`;

  const nextFixture = context?.season?.schedulePublishedAtMs
    ? games.filter(({fixture}) =>
        fixture.status === "scheduled" &&
        fixture.scheduledLocal &&
        Date.parse(`${fixture.scheduledLocal}+02:00`) > Date.now()
      ).sort((a, b) =>
        a.fixture.scheduledLocal.localeCompare(b.fixture.scheduledLocal)
      )[0]?.fixture : null;

  useEffect(() => {
    let cancelled = false;
    setFixtureClubs({});
    if (!nextFixture) return undefined;
    Promise.all([nextFixture.clubAId, nextFixture.clubBId].map(async id => {
      const snapshot = await getDoc(doc(db, "clubs", id));
      return [id, snapshot.data() || {}];
    })).then(items => {
      if (!cancelled) setFixtureClubs(Object.fromEntries(items));
    }).catch(() => {});
    return () => {cancelled = true;};
  }, [nextFixture?.id, clubId]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !busy) {
        setRevision(value => value + 1);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [busy]);

  const openLeagueField = async () => {
    if (!context || typeof onOpenField !== "function") return;
    try {
      const snapshot = await getDoc(doc(db, "leagueVenues", context.scope.venueId));
      const venue = snapshot.data();
      if (!snapshot.exists() ||
          venue?.league?.activeSeason?.id !== context.scope.seasonId ||
          !venue.league.activeSeason.clubIds?.includes(clubId)) {
        throw new Error("This Field season is no longer available.");
      }
      onOpenField({...venue, id: snapshot.id});
    } catch (failure) {
      setError(failure.message || "Could not open the Field.");
    }
  };

  if (seasonPaymentOpen && context && invitation &&
      invitation.paymentStatus !== "paid") {
    return (
      <FieldSeasonPayment scope={context.scope}
        invitation={invitation} paymentPage
        onBack={() => setSeasonPaymentOpen(false)} />
    );
  }

  return (
    <div className="page club-league-season-page">
      <button type="button" className="secondary-btn" onClick={onBack}>
        ← Club Home
      </button>
      <SignupHeroHeader
        photoData={ownPhoto}
        beneficiary={beneficiary}
        attendanceBadgeText={attendanceBadgeText}
        attendanceSubtext={attendanceSubtext}
        isMobile={window.innerWidth <= 640}
        matchTicketBusy={busy || loading}
        showPullOut={false}
        title="Official League Squad"
        subtext={`${context?.venue?.name || "Field league"} · ${
          context?.season?.name || "Season squad"
        }`}
        onPullOut={() => {
          document.querySelector(".league-attendance-card")?.scrollIntoView({
            behavior: "smooth", block: "center",
          });
          setMessage("Tap × on the days you cannot play.");
        }}
        onOpenCalendar={() => setShowLeagueCalendar(true)}
      />
      {publishedDates.length > 0 && (
        <section className="card" style={{padding: 16, marginBottom: 14}}>
          <strong>Starts {formatDay(publishedDates[0])} · Weekly games</strong>
          {publishedDates.length > 1 && <p className="muted small">
            Published schedule: {formatDay(publishedDates[0])}
            {" – "}{formatDay(publishedDates[publishedDates.length - 1])}
          </p>}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {loading ? <p role="status">Loading your league…</p> :
        !user ? <p>Sign in to access your league.</p> :
        !context && !error ? <p>No active Field league for this Club yet.</p> : null}
      {error && !loading && <button type="button" className="secondary-btn"
        disabled={busy} onClick={() => setRevision(value => value + 1)}>
        Try again
      </button>}

      {context && canManageUi && !squad && (
        <section className="card" style={{
          border: "1px solid rgba(167,139,250,.6)", padding: 18,
        }}>
          <h3>Choose your season squad</h3>
          <p className="muted">Invite your players and divide the whole-season
            Club contribution between them.</p>
          <label>Total team fee for the entire season · Rand
            <input className="text-input" type="number" min="0.01"
              step="0.01" value={total} disabled={busy}
              onChange={event => setTotal(event.target.value)} />
          </label>
          <p>{selected.length} selected
            {selected.length > 0 && Number.isFinite(amount) && amount > 0
              ? ` · approximately ${money(totalCents / selected.length)} each`
              : ""}
          </p>
          <input
            className="text-input league-player-search"
            type="search"
            aria-label="Find a Club player"
            placeholder="Search players"
            value={playerSearch}
            onChange={event => setPlayerSearch(event.target.value)}
          />
          <div className="league-player-picker">
            {players.filter(player => player.name.toLowerCase()
              .includes(playerSearch.trim().toLowerCase())).map(player => (
              <label key={player.memberId}
                className={`league-player-option ${
                  selected.includes(player.memberId) ? "is-selected" : ""
                }`}>
                <input type="checkbox" disabled={busy}
                  checked={selected.includes(player.memberId)}
                  onChange={event => setSelected(previous =>
                    event.target.checked
                      ? [...previous, player.memberId]
                      : previous.filter(id => id !== player.memberId))} />
                <span className="league-player-avatar" aria-hidden="true">
                  {player.name.split(/\s+/).slice(0, 2)
                    .map(part => part[0]).join("")}
                </span>
                <span className="league-player-name">{player.name}</span>
              </label>
            ))}
          </div>
          {!players.length && <p>No active players with linked Club memberships
            are available. Check the Club player records.</p>}
          <p className="muted small">Each invitation states the exact contribution.
            Players pay their captain. Acceptance does not confirm payment.</p>
          <button type="button" className="primary-btn"
            disabled={busy || !selected.length ||
              !Number.isSafeInteger(totalCents) || totalCents <= 0}
            onClick={() => {
              if (!window.confirm(
                `Total team fee: ${money(totalCents)} for the entire season.\n` +
                `${selected.length} invited players share this total, approximately ` +
                `${money(totalCents / selected.length)} each.\n\n` +
                "This is NOT the fee per player. Send these invitations?"
              )) return;
              act(createSeasonSquad, {
                totalCents,
                players: players.filter(player => selected.includes(player.memberId))
                  .map(({memberId, sourcePlayerId}) => ({memberId, sourcePlayerId})),
              }, "Season invitations created.");
            }}>
            {busy ? "Saving…" : "Invite squad"}
          </button>
        </section>
      )}

      {canManageUi && squad && (
        <section className="card" style={{padding: 18}}>
          <h3>Season squad</h3>
          <LeagueSeasonMarkPaid
            scope={context.scope}
            entries={entries}
            seasonName={context.season.name || "League season"}
            onConfirmed={report => {
              setMessage(report);
              setRevision(value => value + 1);
            }}
          />
          <p>{money(squad.plan.totalCents)} total · {entries.length} players</p>
          <div className="league-squad-grid">
          {entries.map(entry => (
            <div className={`league-squad-player ${
              entry.paymentStatus === "paid" ? "is-paid" : "is-unpaid"
            }`} key={entry.memberId} style={{
              padding: "14px 0", borderTop: "1px solid rgba(167,139,250,.25)",
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
            }}>
              <div style={{flex: "1 1 180px", minWidth: 0}}>
                <strong>{entry.fullName}</strong>
                <p className="muted small" style={{margin: "5px 0"}}>
                  {money(entry.contributionCents)} · {entry.invitationStatus}
                  {entry.paymentStatus !== "paid" && " · Unpaid"}
                </p>
              </div>
              {entry.paymentStatus === "paid" && (
                <span className="league-paid-badge">✓ Paid</span>
              )}
              {["pending", "accepted"].includes(entry.invitationStatus) &&
                entry.paymentStatus !== "paid" && (
                <button type="button" className="secondary-btn" disabled={busy}
                  onClick={() => {
                    if (!window.confirm(
                      `Confirm you received ${money(entry.contributionCents)} from ${entry.fullName}?`
                    )) return;
                    act(confirmSeasonPayment, {memberId: entry.memberId},
                      "Season payment confirmed.");
                  }}>Confirm paid</button>
              )}
            </div>
          ))}
          </div>
        </section>
      )}

      {context && availabilityPlayers.length > 0 && (
        <section className="card league-attendance-card">
          <h3>Match-day availability</h3>
          <p className="muted small">
            ✓ Available · × Unavailable. Tap a day you cannot play.
          </p>
          {!games.length ? (
            <p className="muted small">Your Field has not scheduled your games yet.</p>
          ) : (
            <div className="league-attendance-scroll">
              <table className="league-attendance-matrix">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    {games.map(({day, fixture}, index) => {
                      const date = day.dateLocal ||
                        fixture.scheduledLocal?.slice(0, 10);
                      const released = Boolean(context.season.schedulePublishedAtMs);
                      const validDate = released &&
                        /^\d{4}-\d{2}-\d{2}$/.test(date || "");
                      return (
                        <th scope="col" key={day.id} data-league-day={day.id}>
                          <span>{validDate
                            ? new Intl.DateTimeFormat("en-ZA", {
                                day: "numeric", month: "short",
                              }).format(new Date(`${date}T12:00:00+02:00`))
                            : `Day ${index + 1}`}</span>
                          {validDate && fixture.scheduledLocal && (
                            <small>{fixture.scheduledLocal.slice(11, 16)}</small>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {availabilityPlayers.map(entry => (
                    <tr key={entry.memberId}>
                      <th scope="row">
                        <span className="league-matrix-person">
                          <span className="league-matrix-avatar">
                            {getPlayerPhoto(entry.fullName || entry.name || "") ? (
                              <img src={getPlayerPhoto(entry.fullName || entry.name || "")} alt=""
                                loading="lazy"
                                onError={event => {
                                  event.currentTarget.style.display = "none";
                                }} />
                            ) : null}
                            <span aria-hidden="true">
                              {(entry.fullName || entry.name || "P")
                                .split(/\s+/).slice(0, 2)
                                .map(part => part[0]).join("")}
                            </span>
                          </span>
                          <span>{entry.fullName || entry.name || entry.memberId}</span>
                        </span>
                        {canManageUi && entry.paymentStatus === "paid" && (
                          <span className="league-matrix-paid" title="Paid"> ✓</span>
                        )}
                      </th>
                      {games.map(({day, editable}) => {
                        const saved = {
                          status: entry.availability?.[day.id] ||
                            (canManageUi
                              ? squad?.matchDayAvailability?.[day.id]?.[entry.memberId]?.status
                              : view?.availability?.[day.id]?.status),
                        };
                        const status = saved?.status === "unavailable"
                          ? "unavailable" : "available";
                        const replacement =
                          squad?.matchDayReplacements?.[day.id]?.[entry.memberId];
                        const hasCover = entry.coverDays?.includes(day.id) || ["pending", "accepted"].includes(
                          replacement?.invitationStatus
                        );
                        return (
                          <td key={day.id} data-status={status || "unconfirmed"}>
                            <button
                              type="button"
                              className={`league-availability-toggle ${
                                status === "unavailable" ? "is-unavailable" : "is-available"
                              }`}
                              aria-label={`${entry.fullName || entry.name || "Player"}: ${
                                day.name || day.label || day.id
                              }, ${status}. Tap to change.`}
                              aria-pressed={status === "unavailable"}
                              disabled={busy || loading || !editable ||
                                (!canManageUi && entry.memberId !== invitation?.memberId) ||
                                (status === "unavailable" && hasCover)}
                              onClick={() => act(
                                setSeasonAvailability,
                                {
                                  matchDayId: day.id,
                                  memberId: entry.memberId,
                                  available: status === "unavailable",
                                },
                                "Attendance saved."
                              )}
                            >
                              <span aria-hidden="true">
                                {status === "unavailable" ? "×" : "✓"}
                              </span>
                            </button>
                            {hasCover && <small>Cover {replacement?.invitationStatus || "arranged"}</small>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {context && canManageUi && context.season.schedulePublishedAtMs && (
        <LeagueMatchDaySubmission
          scope={context.scope} games={games} revision={revision}
          onChanged={() => setRevision(value => value + 1)}
        />
      )}

      {context && (
        <button type="button" className="league-fixture-portal"
          onClick={openLeagueField}
          aria-label="Open your Field league landing page">
          <small>FIELD PORTAL · {context.venue.name}</small>
          {nextFixture ? (
            <>
              <span className="league-fixture-teams">
                {[nextFixture.clubAId, nextFixture.clubBId].map((id, index) => {
                  const club = fixtureClubs[id] || {};
                  const name = club.name || (index === 0
                    ? nextFixture.clubAName : nextFixture.clubBName) || "Club";
                  const logo = club.branding?.logoUrl ||
                    club.transparentLogoUrl || club.logoUrl;
                  return (
                    <React.Fragment key={id}>
                      {index === 1 && <span className="league-fixture-vs">VS</span>}
                      <span className="league-fixture-team">
                        {logo ? <img src={logo} alt="" /> : <span aria-hidden="true">⚽</span>}
                        <strong>{name}</strong>
                      </span>
                    </React.Fragment>
                  );
                })}
              </span>
              <span>{new Intl.DateTimeFormat("en-ZA", {
                weekday: "short", day: "numeric", month: "short",
                hour: "2-digit", minute: "2-digit",
                timeZone: "Africa/Johannesburg",
              }).format(new Date(`${nextFixture.scheduledLocal}+02:00`))}</span>
            </>
          ) : <strong>Enter your Field league</strong>}
          <span>Enter Field →</span>
        </button>
      )}

      {showLeagueCalendar && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true"
            aria-labelledby="league-calendar-title">
            <h3 id="league-calendar-title">League fixtures</h3>
            <button type="button" className="secondary-btn"
              autoFocus onClick={() => setShowLeagueCalendar(false)}>Close</button>
            {!context?.season?.schedulePublishedAtMs ? (
              <p>Your Field has not published its fixtures yet.</p>
            ) : games.map(({fixture}) => (
              <p key={fixture.id}>
                {fixture.scheduledLocal?.replace("T", " · ")}<br />
                {fixture.clubAName} vs {fixture.clubBName}
              </p>
            ))}
          </section>
        </div>
      )}

      {context && (!canManageUi || invitation) && (
        <section className="card league-own-booking">
          {!invitation ? <p>You have no season squad invitation yet.</p> : (
            <>
              <h3>{invitation.fullName}</h3>
              {invitation.paymentStatus === "paid" ? (
                <p className="league-own-paid" role="status">✓ Paid · Season place booked</p>
              ) : (
                <>
                  <h2>{money(Number(invitation.contributionCents) + (
                    invitation.platformFeePaymentStatus === "paid" ? 0 : 7900
                  ))}</h2>
                  <p className="muted small">Whole season · total payable</p>
                  <FieldSeasonPayment scope={context.scope}
                    invitation={invitation}
                    onOpenPayment={() => setSeasonPaymentOpen(true)} />
                </>
              )}
              <p>{invitation.paymentStatus === "paid"
                ? "Your club contribution is confirmed."
                : invitation.invitationStatus === "accepted"
                ? invitation.seasonCheckoutPaymentId
                  ? "Checkout opened · admin confirmation pending."
                  : "Invitation accepted · payment not yet confirmed."
                : invitation.invitationStatus === "declined"
                ? "Invitation declined." : "Your captain has invited you to the squad."}</p>
              {invitation.invitationStatus === "pending" && (
                <div style={{display: "flex", flexWrap: "wrap", gap: 12}}>
                  {["accepted", "declined"].map(response => (
                    <button key={response} type="button"
                      className={response === "accepted" ? "primary-btn" : "secondary-btn"}
                      disabled={busy} onClick={() => act(respondSeasonInvitation,
                        {memberId: invitation.memberId, response},
                        response === "accepted" ? "Invitation accepted." : "Invitation declined.")}>
                      {response === "accepted" ? "Accept invitation" : "Decline"}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
