import {leagueBibIssues} from "../core/leagueBibPolicy.mjs";
import {validateKitTeams} from "../core/playerKit.js";
import React, {useEffect, useState} from "react";
import {collection, getDocs} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {
  getClubMatchDaySquad, submitClubMatchDaySquad,
  confirmMatchDayCover, cancelMatchDayCover,
} from "../storage/fieldSeasonSquadRepository.js";
import "./LeagueMatchDaySubmission.css";

const testMode = import.meta.env.MODE === "staging";
const today = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Johannesburg", year: "numeric",
  month: "2-digit", day: "2-digit",
}).format(new Date());

export default function LeagueMatchDaySubmission({scope, games, revision, onChanged}) {
  const upcoming = games.filter(({day, editable}) =>
    editable && day.dateLocal >= today()
  ).sort((a, b) => a.day.dateLocal.localeCompare(b.day.dateLocal));
  const [dayId, setDayId] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [kitNumbers,setKitNumbers]=useState({});
  const [kitConfirmed,setKitConfirmed]=useState(false);
  const [directory, setDirectory] = useState(null);
  const [coverFor, setCoverFor] = useState("");
  const [coverId, setCoverId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [localRevision, setLocalRevision] = useState(0);

  useEffect(() => {
    let requested = "";
    try {
      const key = `league-squad-focus:${scope.clubId}`;
      const request = JSON.parse(sessionStorage.getItem(key) || "null");
      if (request?.seasonId === scope.seasonId) requested = request.matchDayId;
      sessionStorage.removeItem(key);
    } catch {}
    const valid = upcoming.find(({day}) => day.id === requested);
    setDayId(previous => valid?.day.id ||
      upcoming.find(({day}) => day.id === previous)?.day.id ||
      upcoming[0]?.day.id || "");
    if (requested || valid) {
      document.querySelector(".league-attendance-card")?.scrollIntoView({
        behavior: "smooth", block: "start",
      });
      const column = Array.from(document.querySelectorAll("[data-league-day]"))
        .find(element => element.dataset.leagueDay === requested);
      column?.scrollIntoView({behavior: "smooth", block: "nearest", inline: "center"});
    }
  }, [scope.clubId, scope.seasonId, games.map(({day}) => day.id).join("|")]);

  useEffect(() => {
    if (!dayId) {setData(null); return undefined;}
    let disposed = false;
    setLoading(true); setError("");
    getClubMatchDaySquad({...scope, matchDayId: dayId, testMode})
      .then(result => {
        if (disposed) return;
        setData(result);
        setSelected(result.selectedMemberIds || []);
        setKitNumbers(result.confirmed ? result.kitNumbers || {} : Object.fromEntries((result.candidates || []).map(player=>[player.sourcePlayerId,player.jerseyNumber ?? null])));
        setKitConfirmed(result.confirmed === true);
      })
      .catch(failure => {if (!disposed) setError(failure.message);})
      .finally(() => {if (!disposed) setLoading(false);});
    return () => {disposed = true;};
  }, [scope.clubId, scope.venueId, scope.seasonId, dayId, revision, localRevision]);

  async function loadDirectory(originalId) {
    setBusy(true); setError(""); setCoverFor(originalId);
    setCoverId(""); setSearch("");
    try {
      if (directory) return;
      const [members, profiles] = await Promise.all([
        getDocs(collection(db, "clubs", scope.clubId, "publicMembers")),
        getDocs(collection(db, "clubs", scope.clubId, "publicPlayers")),
      ]);
      const byId = new Map(profiles.docs.map(item => [item.id, item.data()]));
      setDirectory(members.docs.flatMap(item => {
        const member = item.data();
        const profile = byId.get(member.playerId);
        if ((member.status || "active") !== "active" || !profile ||
            (profile.status || "active") !== "active") return [];
        return [{
          memberId: item.id, sourcePlayerId: member.playerId,
          fullName: profile.fullName || profile.displayName ||
            profile.name || profile.playerName || item.id,
        }];
      }).sort((a, b) => a.fullName.localeCompare(b.fullName)));
    } catch (failure) {setError(failure.message);}
    finally {setBusy(false);}
  }

  async function run(operation, details) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await operation({...scope, matchDayId: dayId, testMode, ...details});
      setCoverFor(""); setCoverId("");
      setLocalRevision(value => value + 1);
      onChanged?.();
    } catch (failure) {setError(failure.message);}
    finally {setBusy(false);}
  }

  const selectedPlayers=selected.map(id=>data?.candidates?.find(player=>player.memberId===id)).filter(Boolean);
  const kitIssues=leagueBibIssues(selectedPlayers,kitNumbers);
  const deadline=data?.deadlineAtMs ? new Date(data.deadlineAtMs).toLocaleString("en-ZA",{timeZone:"Africa/Johannesburg",dateStyle:"medium",timeStyle:"short"}) : "";
  const ready = !busy && !loading && kitConfirmed && kitIssues.length === 0 &&
    selected.length >= 5 && selected.length <= 6 &&
    new Set(selected).size === selected.length &&
    selected.every(id => data?.candidates?.some(player => player.memberId === id));
  const unchanged = data?.confirmed &&
    JSON.stringify(selected) === JSON.stringify(data.selectedMemberIds) && JSON.stringify(kitNumbers) === JSON.stringify(data.kitNumbers || {});
  if (!upcoming.length) return null;

  return (
    <section className="card league-send-panel" aria-label="Send matchday squad">
      <div className="league-send-heading">
        <div><h3>Match-day squad</h3><small>5 players · optional sixth player</small></div>
        <select aria-label="Match day" value={dayId}
          disabled={busy} onChange={event => setDayId(event.target.value)}>
          {upcoming.map(({day}) => (
            <option key={day.id} value={day.id}>{day.dateLocal}</option>
          ))}
        </select>
      </div>
      {loading && <p className="muted small" role="status">Checking squad readiness…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !loading && (
        <>
          <p className="muted small">
            {unchanged ? "✓ Confirmed with the Field." :
              ready ? "Your squad is ready to send." :
              selected.length>=5 ? "Check the kit warnings below and confirm the actual bibs." : `${selected.length}/6 selected. Choose 5 or 6 players.`}
          </p>
          <p className="muted small">
            Check player mentality and shooting settings on the Club side before
            sending. These settings help determine positions.
            Set your Club’s formation on the Field side before the match.
          </p>
          <div className="league-send-players">
            {data.candidates.map(player => {
              const index = selected.indexOf(player.memberId);
              return (
                <label key={player.memberId} className={index >= 0 ? "is-selected" : ""}>
                  <input type="checkbox" checked={index >= 0} disabled={busy}
                    onChange={() => {setKitConfirmed(false);setSelected(current =>
                      current.includes(player.memberId)
                        ? current.filter(id => id !== player.memberId)
                        : current.length < 6 ? [...current, player.memberId] : current
                    );}} />
                  <span>{player.jerseyNumber != null ? `#${player.jerseyNumber} · ` : "— · "}{player.fullName}
                    <small>{player.ownsNumberedBib === true ? "Numbered bib recorded" : "Numbered bib required"}</small>
                    {player.isFillIn && <small>Fill-in · no season charge</small>}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="league-captain-kit"><h3>Official league kit check</h3><p>Every selected player, including fill-ins, must own and wear a numbered bib. A jersey alone, an unnumbered bib or a purchase not yet received does not qualify.</p><p><strong>Teamsheet due: {deadline || "24 hours before kickoff"} (South African time).</strong> Submit early. Late changes must be resolved with Field management.</p>{kitIssues.length>0&&<ul className="league-bib-issues">{kitIssues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}<label className="league-bib-confirm"><input type="checkbox" checked={kitConfirmed} disabled={busy || kitIssues.length>0 || !selectedPlayers.length} onChange={event=>setKitConfirmed(event.target.checked)}/><span>I have checked every selected player's actual numbered bib and confirm that the numbers above match the kit they will wear.</span></label></div>

          {data.vacancies.map(player => (
            <div className="league-send-vacancy" key={player.memberId}>
              <span>{player.fullName} · unavailable</span>
              {player.coverStatus === "pending" ? (
                <button type="button" disabled={busy} onClick={() => run(
                  cancelMatchDayCover, {originalMemberId: player.memberId}
                )}>Remove pending cover</button>
              ) : (
                <button type="button" disabled={busy}
                  onClick={() => loadDirectory(player.memberId)}>Add fill-in</button>
              )}
            </div>
          ))}
          {coverFor && (
            <div className="league-cover-picker">
              <p className="muted small">
                Select a Club player who has agreed to cover. No season fee or winnings entitlement is added.
              </p>
              <input type="search" placeholder="Find Club player"
                aria-label="Find replacement player" value={search}
                onChange={event => setSearch(event.target.value)} />
              <select aria-label="Replacement player" value={coverId}
                onChange={event => setCoverId(event.target.value)}>
                <option value="">Choose player</option>
                {(directory || []).filter(player =>
                  player.fullName.toLowerCase().includes(search.toLowerCase())
                ).map(player => (
                  <option key={player.memberId} value={player.memberId}>{player.fullName}</option>
                ))}
              </select>
              <button type="button" disabled={busy || !coverId}
                onClick={() => {
                  const player = directory?.find(item => item.memberId === coverId);
                  if (player) run(confirmMatchDayCover, {
                    originalMemberId: coverFor,
                    memberId: player.memberId, sourcePlayerId: player.sourcePlayerId,
                  });
                }}>Confirm agreed fill-in</button>
              <button type="button" disabled={busy} onClick={() => setCoverFor("")}>Cancel</button>
            </div>
          )}
          {data.testException && (
            <p className="muted small">Staging test: early squad submission enabled.</p>
          )}
          {data.sendAllowed ? (
            <button type="button"
              className={`primary-btn league-send-button ${ready && !unchanged ? "is-ready" : ""}`}
              disabled={!ready || unchanged}
              onClick={() => {
                const selectedPlayers=selected.map(id=>data.candidates.find(player=>player.memberId===id)).filter(Boolean);
                const numbers=Object.fromEntries(selectedPlayers.map(player=>[player.sourcePlayerId,Object.hasOwn(kitNumbers,player.sourcePlayerId)?kitNumbers[player.sourcePlayerId]:player.jerseyNumber ?? null]));
                try{validateKitTeams([{id:scope.clubId,label:"Your squad",players:selectedPlayers.map(player=>({key:player.sourcePlayerId,name:player.fullName,number:numbers[player.sourcePlayerId]}))}]);}
                catch(error){setError(error.message);return;}
                run(submitClubMatchDaySquad, {memberIds:selected,kitNumbers:numbers,kitConfirmed});
              }}>
              {busy ? "Saving…" : unchanged ? "✓ Squad sent" : "Send Squad"}
            </button>
          ) : (
            <p className="muted small">
              The submission deadline has passed. Contact Field management; the required numbered teamsheet must be submitted at least 24 hours before kickoff.
            </p>
          )}
        </>
      )}
    </section>
  );
}
