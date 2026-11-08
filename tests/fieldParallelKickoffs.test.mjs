import test from "node:test";
import assert from "node:assert/strict";
import {applyFieldScheduleDecision} from "../functions/fieldDecisionSchedule.mjs";
import {canStartBesideLiveFixtures} from "../functions/fieldParallelKickoffs.mjs";
import {resolveFieldUpcomingMatch} from "../src/core/fieldUpcomingMatch.js";

const now = Date.parse("2026-11-08T12:00:00+02:00");
const fixture = (id, clubAId, clubBId, time) => ({id, clubAId, clubBId,
  matchDayId:"day", status:"scheduled", scheduledLocal:`2026-11-08T${time}`});
const season = {status:"active", scheduleVersion:1, clubIds:["a","b","c","d","e","f"],
  matchDays:[{id:"day",status:"scheduled",dateLocal:"2026-11-08",fixtureIds:["one","two","three"]}],
  fixtures:[fixture("one","a","b","17:00"),fixture("two","c","d","17:50"),fixture("three","e","f","18:40")]};
const decision = {action:"parallel_kickoff",reason:"Both pitches are available.",
  parameters:{matchDayId:"day",startTime:"17:00",fixtureIds:["one","two"]}};
const configure = (state, proposal=decision) => ({...state, ...applyFieldScheduleDecision({
  season:state, decision:proposal, actorUid:"creator", now})});
const live = {one:{status:"live",fixtureId:"one",clubAId:"a",clubBId:"b"}};

test("only explicitly grouped fixtures on different pitches may start in parallel", () => {
  const ordinary = {...season,liveMatches:live};
  assert.equal(canStartBesideLiveFixtures(ordinary, season.fixtures[1]),false);
  assert.equal(resolveFieldUpcomingMatch({season:ordinary}).nextFixture,null);
  const grouped = {...configure(season),liveMatches:live};
  assert.deepEqual(grouped.fixtures.map(f=>[f.scheduledLocal.slice(11), f.pitchNumber]),
    [["17:00",1],["17:00",2],["18:40",undefined]]);
  assert.equal(resolveFieldUpcomingMatch({season:grouped}).nextFixture.id,"two");
  assert.equal(canStartBesideLiveFixtures(grouped,{...grouped.fixtures[1],pitchNumber:1}),false);
  assert.equal(canStartBesideLiveFixtures(grouped,grouped.fixtures[2]),false);
});

test("grouping rejects clubs on two pitches, overlapping serial games, and live fixtures", () => {
  const sameClub = {...season,fixtures:[season.fixtures[0],{...season.fixtures[1],clubAId:"a"},season.fixtures[2]]};
  assert.throws(()=>configure(sameClub),/club cannot play on two pitches/);
  assert.throws(()=>configure(season,{...decision,parameters:{...decision.parameters,startTime:"18:10"}}),/overlaps/);
  assert.throws(()=>configure({...season,liveMatches:live}),/unplayed/);
});

test("a whole-day reschedule restores ordinary sequential kickoffs", () => {
  const serial = configure(configure(season),{action:"reschedule_day",reason:"Only one pitch is available.",
    parameters:{matchDayId:"day",startTime:"17:00",dateLocal:"2026-11-08"}});
  assert.deepEqual(serial.fixtures.map(f=>[f.scheduledLocal.slice(11),f.pitchNumber]),
    [["17:00",undefined],["17:50",undefined],["18:40",undefined]]);
});
