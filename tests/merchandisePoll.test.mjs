import test from "node:test";
import assert from "node:assert/strict";
import {clubKitInterestDraft,pollMerchandiseId,compactKitPollOption,compactKitPollQuestion} from "../src/core/merchandisePoll.mjs";
test("kit interest draft attaches a stable product and all individually priced choices",()=>{
 const draft=clubKitInterestDraft();assert.equal(draft.merchandiseId,"club-kit");assert.equal(draft.question,"Who wants a club kit?");assert.deepEqual(draft.options.map(x=>x.replace(/\s/g,"")),["Top+shorts·R700","Top·R400","Shorts·R300","Notnow"]);
 draft.options.pop();assert.equal(clubKitInterestDraft().options.length,4);
});
test("only recognised merchandise can be attached, and removing it yields a normal poll",()=>{
 assert.equal(pollMerchandiseId("club-kit"),"club-kit");for(const value of ["",null,undefined,"https://evil.example",{},"other"])assert.equal(pollMerchandiseId(value),"");
});

test("old generated labels are shortened for display without rewriting custom labels or choices",()=>{assert.equal(compactKitPollOption("Interested in top only (R400)"),"Top · R400");assert.equal(compactKitPollOption("Custom team answer"),"Custom team answer");});

test("generated old kit questions are shortened without rewriting custom questions",()=>{assert.equal(compactKitPollQuestion("Who is interested in ordering a club kit? Top R 400, shorts R 300"),"Who wants a club kit?");assert.equal(compactKitPollQuestion("Which colour should we choose?"),"Which colour should we choose?");});
