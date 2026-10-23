import test from "node:test";
import assert from "node:assert/strict";
import {clubKitInterestDraft,pollMerchandiseId} from "../src/core/merchandisePoll.mjs";
test("kit interest draft attaches a stable product and all individually priced choices",()=>{
 const draft=clubKitInterestDraft();assert.equal(draft.merchandiseId,"club-kit");assert.match(draft.question,/badge and number included/);assert.deepEqual(draft.options.map(x=>x.replace(/\s/g,"")),["Interestedintop+shorts(R700)","Interestedintoponly(R400)","Interestedinshortsonly(R300)","Notatthemoment"]);
 draft.options.pop();assert.equal(clubKitInterestDraft().options.length,4);
});
test("only recognised merchandise can be attached, and removing it yields a normal poll",()=>{
 assert.equal(pollMerchandiseId("club-kit"),"club-kit");for(const value of ["",null,undefined,"https://evil.example",{},"other"])assert.equal(pollMerchandiseId(value),"");
});
