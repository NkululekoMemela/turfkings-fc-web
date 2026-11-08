import React, {useReducer} from "react";
import PracticeGuide from "./PracticeGuide.jsx";
import {initialLeagueDrill,practiceLeagueEligible,practiceLeaguePlayers,runLeagueDrill} from "../core/practiceLeagueDrill.mjs";

const stages = ["invitation","commitment","eligibility","fieldEntry","squad","submitted"];
export default function ClubPracticeLeague({active, company, sessionKey, preferenceScope, onBack}) {
  const [state, dispatch] = useReducer(runLeagueDrill, undefined, initialLeagueDrill);
  if (!active) return null;
  const stageIndex = stages.indexOf(state.stage);
  const steps = [
    ["invitation","Accept the Field’s invitation","Act as captain. Check the entry terms and accept the fictional Field’s invitation."],
    ["commitment","Confirm a player’s season commitment","Act as a player. Accept the Club’s season squad invitation. This is separate from the Club’s entry with the Field."],
    ["eligibility",company?"Check company funding":"Check player payment",
      company?"The player accepts and confirms availability. Simulate FANM authorising the company allowance. No player or captain pays personally."
        :"Simulate confirming eligible players’ season contributions. A commitment alone doesn’t make the player eligible."],
    ["fieldEntry","Confirm the Club’s Field entry","Rehearse checking the Club’s entry with the Field. This confirmation is separate from individual player eligibility."],
    ["squad","Submit the matchday squad","Pick at least five eligible, available players for the fixture, then submit the squad."],
  ].map(([target,title,text]) => ({
    page:"league-drill", target:`practice-league-${target}`, title,text,
  }));
  const act = type => () => dispatch({type});
  return <main className="page">
    <PracticeGuide sessionKey={sessionKey} controlledIndex={stageIndex} preferenceScope={preferenceScope} steps={steps} page="league-drill"/>
    <section className="card">
      <h2>Enter a Field League</h2>
      <p>{company?"Company-funded Club":"Community Club"} · Five-a-side · Practice only</p>
      <p>Rehearse the captain and player roles with fictional players and one fixture. All confirmations are simulated in this tab.</p>
      <button type="button" className="secondary-btn" onClick={onBack}>Back to Club</button>
    </section>
    <section className="card">
      {state.stage === "invitation" && <><h3>Harbour Field invitation</h3><p>Harbour Field has invited your Club to a five-a-side season. First fixture: Harbour Rovers vs your Club.</p>
        <button type="button" className="primary-btn" data-practice-guide="practice-league-invitation" onClick={act("accept")}>Accept Field invitation</button></>}
      {state.stage === "commitment" && <><h3>Ari’s season place</h3><p>Your captain has invited you to the season squad. Review the fixture and commit to the season.</p>
        <button type="button" className="primary-btn" data-practice-guide="practice-league-commitment" onClick={act("commit")}>Confirm player commitment</button></>}
      {state.stage === "eligibility" && <><h3>{company?"Company funding pending":"Player payments pending"}</h3><p>{company?"An accepted invitation awaits company authorisation. Players are never charged personally.":"The season contributions are separate from your ordinary match bookings."} Gray’s eligibility will remain pending in this drill.</p>
        <button type="button" className="primary-btn" data-practice-guide="practice-league-eligibility" onClick={act("confirmFunding")}>{company?"Simulate company authorisation":"Simulate player payment confirmation"}</button></>}
      {state.stage === "fieldEntry" && <><h3>Club entry with Harbour Field</h3><p>Player eligibility has been updated. The Field still has to verify the Club’s entry. Rehearse receiving that confirmation.</p>
        <button type="button" className="primary-btn" data-practice-guide="practice-league-fieldEntry" onClick={act("confirmEntry")}>Simulate Field entry confirmation</button></>}
      {state.stage === "squad" && <>
        <h3>Select the matchday squad</h3>
        <label>Unavailable for this fixture <select value={state.unavailable}
          onChange={event=>dispatch({type:"availability",name:event.target.value})}>
          <option value="">No absences</option>{practiceLeaguePlayers.map(name=><option key={name}>{name}</option>)}
        </select></label>
        <ul>{practiceLeaguePlayers.map(name => <li key={name}><label>
          <input type="checkbox" checked={state.selected.includes(name)} disabled={!practiceLeagueEligible(state,name)} onChange={()=>dispatch({type:"toggle",name})}/> {name}
          {" · "}{name === "Gray" ? "Eligibility pending" : name === state.unavailable ? "Unavailable" : company ? "Funding authorised" : "Payment confirmed"}
        </label></li>)}</ul>
        <button type="button" className="primary-btn" data-practice-guide="practice-league-squad" disabled={state.selected.length < 5} onClick={act("submit")}>Submit squad ({state.selected.length})</button>
      </>}
      {state.stage === "submitted" && <><h3>Practice squad submitted</h3><p>{state.selected.join(", ")}</p>
        <p>In Official mode, the Field uses the submitted squad to prepare the fixture and verify the lineup.</p>
        <button type="button" className="secondary-btn" onClick={act("reset")}>Rehearse again</button></>}
    </section>
  </main>;
}
