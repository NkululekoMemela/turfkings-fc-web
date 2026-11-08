import test from "node:test";
import assert from "node:assert/strict";
import {initialLeagueDrill,practiceLeagueEligible,practiceLeaguePlayers,runLeagueDrill} from "../src/core/practiceLeagueDrill.mjs";
import {clubGuideSteps,fieldGuideSteps} from "../src/components/practiceGuideSteps.js";

const act = (state,type,name) => runLeagueDrill(state,{type,name});
test("season eligibility and Field entry are separate prerequisites to a matchday submission", () => {
  const initial = initialLeagueDrill();
  assert.equal(act(initial,"confirmFunding"),initial);
  const committed = act(act(initial,"accept"),"commit");
  assert.equal(practiceLeagueEligible(committed,"Ari"),false);
  const funded = act(committed,"confirmFunding");
  assert.equal(practiceLeagueEligible(funded,"Ari"),false);
  let squad = act(funded,"confirmEntry");
  squad = act(squad,"toggle","Gray");
  assert.deepEqual(squad.selected,[]);
  for (const player of practiceLeaguePlayers.slice(0,5)) squad = act(squad,"toggle",player);
  squad = act(squad,"availability","Ari");
  assert.equal(act(squad,"submit").stage,"squad");
  squad = act(squad,"toggle","Frankie");
  assert.equal(act(squad,"submit").stage,"submitted");
});
test("the Club paths explain different funding and match preparation", () => {
  const friendly = clubGuideSteps({miniLeague:false,company:false});
  const mini = clubGuideSteps({miniLeague:true,company:true});
  assert.ok(friendly.findIndex(step=>step.target==="club-pay") <
    friendly.findIndex(step=>step.target==="club-paid-players"));
  assert.ok(mini.find(step=>step.target==="club-pay").title.includes("company"));
  assert.equal(friendly.some(step=>step.target==="club-standings"),false);
  assert.equal(mini.some(step=>step.target==="club-standings"),true);
  assert.ok(fieldGuideSteps.findIndex(step=>step.target==="match-half-time") <
    fieldGuideSteps.findIndex(step=>step.target==="match-close"));
});
