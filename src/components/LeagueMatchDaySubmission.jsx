import PremiumSelect from "./PremiumSelect.jsx";
import {kitColourClashes,kitColourKey} from "../../functions/opponentKitColours.mjs";
import {suggestMatchBibs} from "../core/automaticMatchBibs.mjs";
import {leagueBibIssues} from "../core/leagueBibPolicy.mjs";
import {validateKitTeams} from "../core/playerKit.js";
import React, {useEffect, useState} from "react";
import {collection, getDocs} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {
  getClubMatchDaySquad, submitClubMatchDaySquad,
  confirmMatchDayCover, cancelMatchDayCover, setSeasonAvailability,
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
  const [kitAssignments,setKitAssignments]=useState({});
  const [sharedBibColor,setSharedBibColor]=useState('');
  const [teamBibSource,setTeamBibSource]=useState('');
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
        setKitAssignments(result.kitAssignments || {});
        setSharedBibColor(result.matchColour||'');
        setKitConfirmed(result.ready === true || result.confirmed === true);
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

  function fillTeamBibs(source,color){
    if(!source||!color.trim())return;
    try{const result=suggestMatchBibs({players:selected.map(id=>data?.candidates?.find(player=>player.memberId===id)).filter(Boolean),source,color,numbers:kitNumbers});setKitNumbers(result.numbers);setKitAssignments(result.assignments);setKitConfirmed(false);setError('');}catch(error){setError(error.message);}
  }
  useEffect(()=>{if(teamBibSource&&sharedBibColor.trim())fillTeamBibs(teamBibSource,sharedBibColor);},[selected.join("|")]);
  const selectedPlayers=selected.map(id=>data?.candidates?.find(player=>player.memberId===id)).filter(Boolean).map(player=>{const bib=kitAssignments[player.sourcePlayerId];if(!bib)return player;const number=kitNumbers[player.sourcePlayerId]??player.jerseyNumber??null;return {...player,jerseyNumber:number,bibColor:bib.color||'',matchBib:{...bib,number,available:true}};});
  const clashes=kitColourClashes(selectedPlayers,data?.opponentColours||[]);
  const kitIssues=[...leagueBibIssues(selectedPlayers,kitNumbers),...(clashes.length?[`Opponent uses ${clashes.join(", ")}. Choose a different bib colour.`]:[])];
  const {minimum = 5, maximum = 6} = data || {};
  const deadline=data?.deadlineAtMs ? new Date(data.deadlineAtMs).toLocaleString("en-ZA",{timeZone:"Africa/Johannesburg",dateStyle:"medium",timeStyle:"short"}) : "";
  const ready = !busy && !loading && kitConfirmed && kitIssues.length === 0 &&
    selected.length >= minimum && selected.length <= maximum &&
    new Set(selected).size === selected.length &&
    selected.every(id => data?.candidates?.some(player => player.memberId === id));
  const unchanged = data?.confirmed &&
    JSON.stringify(selected) === JSON.stringify(data.selectedMemberIds) && JSON.stringify(kitNumbers) === JSON.stringify(data.kitNumbers || {});
  if (!upcoming.length) return null;

  return (
    <section className="card league-send-panel" aria-label="Weekly availability">
      <div className="league-send-heading">
        <div><h3>Weekly availability</h3><small>Your season squad, carried forward</small></div>
        <PremiumSelect aria-label="Match day" value={dayId}
          disabled={busy} onChange={event => setDayId(event.target.value)}>
          {upcoming.map(({day}) => (
            <option key={day.id} value={day.id}>{day.dateLocal}</option>
          ))}
        </PremiumSelect>
      </div>
      {loading && <p className="muted small" role="status">Checking squad readiness…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !loading && (
        <>
          <p className="muted small">
            {unchanged ? "✓ Availability confirmed." :
              ready ? "Season squad, colours and numbers are ready automatically. Change only exceptions." :
              data.stockConfirmed===false ? "Waiting for Field bib stock." :
              selected.length>=minimum ? "Check the kit warnings below and confirm the actual bibs." : `${selected.length}/${maximum} selected. Choose ${minimum} or ${maximum} players.`}
          </p>
          {data.matchColour&&<p className="muted small">Match colour: <strong>{data.matchColour}</strong> · numbers assigned by the Field.</p>}
          <details open={!data.ready || data.needsSelection} className="league-weekly-adjustments">
            <summary>{selected.length} players · View or adjust squad</summary>
          {data.opponentColours?.length>0&&<small className="muted">Opponent: {data.opponentColours.join(", ")} · choose a different colour.</small>}
          <label className="league-shared-bib-color">Match bibs<PremiumSelect aria-label="Team bib source" value={teamBibSource} disabled={busy} onChange={event=>{const source=event.target.value;setTeamBibSource(source);fillTeamBibs(source,sharedBibColor);}}><option value="">Individual kit</option><option value="hired">Hired bibs where needed</option><option value="club">Club bibs where needed</option></PremiumSelect></label>
          <label className="league-shared-bib-color">Club / hire bib colour<PremiumSelect value={sharedBibColor} onChange={event=>{const color=event.target.value;setSharedBibColor(color);fillTeamBibs(teamBibSource,color);setKitConfirmed(false);if(!teamBibSource)setKitAssignments(current=>Object.fromEntries(Object.entries(current).map(([key,bib])=>[key,{...bib,color}])));}}><option value="">Choose colour</option>{data.matchColour&&!["Blue","Green","Orange","Gold","Red","White","Black"].includes(data.matchColour)&&<option value={data.matchColour}>{data.matchColour} · fixture</option>}{["Blue","Green","Orange","Gold","Red","White","Black"].map(color=><option key={color} value={color} disabled={(data.opponentColours||[]).map(kitColourKey).includes(kitColourKey(color)) || Boolean(data.matchColour&&kitColourKey(color)!==kitColourKey(data.matchColour))}>{color}{(data.opponentColours||[]).map(kitColourKey).includes(kitColourKey(color))?" · opponent":""}</option>)}</PremiumSelect></label>
          {teamBibSource&&<small className="muted">Owned bibs keep their numbers when colours match. Hired bibs use the numbers supplied by the Field. Confirm the supplied bibs match.</small>}
          <div className="league-send-players">
            {data.candidates.map(player => {
              const index = selected.indexOf(player.memberId);
              return (
                <div key={player.memberId} className="league-match-bib-row"><label className={index >= 0 ? "is-selected" : ""}>
                  <input type="checkbox" checked={index >= 0} disabled={busy}
                    onChange={() => {setKitConfirmed(false);setSelected(current =>
                      current.includes(player.memberId)
                        ? current.filter(id => id !== player.memberId)
                        : current.length < maximum ? [...current, player.memberId] : current
                    );}} />
                  <span>{kitNumbers[player.sourcePlayerId] != null && kitNumbers[player.sourcePlayerId] !== "" ? `(${kitNumbers[player.sourcePlayerId]}) ` : "(-) "}{player.fullName}
                    <small>{kitAssignments[player.sourcePlayerId]?.source === "hired" ? "Hired bib assigned" : kitAssignments[player.sourcePlayerId] ? "Club bib assigned" : player.matchBib?.allocationSource === "field" ? "Field-assigned bib" : player.ownsNumberedBib === true ? "Own bib" : "Assign a match bib"}</small>
                    {player.isFillIn && <small>Fill-in · no season charge</small>}
                  </span>
                  {!player.isFillIn&&<button type="button" className="secondary-btn" disabled={busy} onClick={event=>{event.preventDefault();run(setSeasonAvailability,{memberId:player.memberId,available:false});}}>Unavailable</button>}
                </label>
                {index>=0&&<details className="league-bib-adjust"><summary>Adjust kit</summary><div className="league-match-bib-controls"><PremiumSelect aria-label={`${player.fullName} bib source`} value={kitAssignments[player.sourcePlayerId]?.source||player.matchBib?.source||"own"} disabled={busy} onChange={event=>{const source=event.target.value;setKitConfirmed(false);setKitAssignments(current=>{const next={...current};if(source==='own')delete next[player.sourcePlayerId];else next[player.sourcePlayerId]={source,color:sharedBibColor||player.bibColor||'',number:kitNumbers[player.sourcePlayerId]??player.jerseyNumber??''};return next;});}}><option value="own" disabled={player.matchBib?.allocationSource==='field'}>Own bib</option><option value="club">Club bib</option><option value="hired">Hired bib</option></PremiumSelect><input aria-label={`${player.fullName} match bib number`} inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} placeholder="Number" disabled={busy} value={kitNumbers[player.sourcePlayerId]??''} onChange={event=>{const number=event.target.value;setKitNumbers(current=>({...current,[player.sourcePlayerId]:number}));setKitConfirmed(false);setKitAssignments(current=>current[player.sourcePlayerId]?{...current,[player.sourcePlayerId]:{...current[player.sourcePlayerId],number}}:current);}}/>{kitAssignments[player.sourcePlayerId]&&<input aria-label={`${player.fullName} bib colour`} placeholder="Colour" disabled={busy} value={kitAssignments[player.sourcePlayerId].color} onChange={event=>{const color=event.target.value;setKitAssignments(current=>({...current,[player.sourcePlayerId]:{...current[player.sourcePlayerId],color}}));setKitConfirmed(false);}}/>}</div></details>}
                </div>
              );
            })}
          </div>
          <div className="league-captain-kit"><h3>Official league kit check</h3><p>Profile kit details are reused. Resolve only the warnings below.</p><p><strong>Changes open until {deadline || "kickoff"} (South African time).</strong></p>{kitIssues.length>0&&<ul className="league-bib-issues">{kitIssues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}<label className="league-bib-confirm"><input type="checkbox" checked={kitConfirmed} disabled={busy || kitIssues.length>0 || !selectedPlayers.length} onChange={event=>setKitConfirmed(event.target.checked)}/><span>Use these match allocations. The referee checks the bibs on the pitch.</span></label></div>

          </details>
          {data.vacancies.map(player => (
            <div className="league-send-vacancy" key={player.memberId}>
              <span>{player.fullName} · unavailable</span>
              {!player.coverStatus&&<button type="button" disabled={busy} onClick={()=>run(setSeasonAvailability,{memberId:player.memberId,available:true})}>Available again</button>}
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
              <PremiumSelect aria-label="Replacement player" value={coverId}
                onChange={event => setCoverId(event.target.value)}>
                <option value="">Choose player</option>
                {(directory || []).filter(player =>
                  player.fullName.toLowerCase().includes(search.toLowerCase())
                ).map(player => (
                  <option key={player.memberId} value={player.memberId}>{player.fullName}</option>
                ))}
              </PremiumSelect>
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
                run(submitClubMatchDaySquad, {memberIds:selected,kitNumbers:numbers,kitAssignments:Object.fromEntries(Object.entries(kitAssignments).filter(([key])=>selectedPlayers.some(player=>player.sourcePlayerId===key)).map(([key,bib])=>[key,{...bib,number:numbers[key]}])),kitConfirmed});
              }}>
              {busy ? "Saving…" : unchanged ? "✓ Confirmed" : "Confirm availability"}
            </button>
          ) : (
            <p className="muted small">
              Kickoff has arrived. Ask the referee about last-minute lineup changes.
            </p>
          )}
        </>
      )}
    </section>
  );
}
