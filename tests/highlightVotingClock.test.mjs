import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import {matchVotingDeadline,matchVotingLabel} from '../src/core/highlightVotingClock.mjs';
const {weeklyDeadline}=createRequire(import.meta.url)('../functions/highlightRetentionPolicy.cjs');
test('two matchdays in one week keep independent deadlines matching server cleanup',()=>{
 const monday=[{createdAtISO:'2026-11-02T20:00:00Z'}],thursday=[{createdAtISO:'2026-11-05T20:00:00Z'}];
 assert.equal(matchVotingDeadline(monday),weeklyDeadline(monday));assert.equal(matchVotingDeadline(thursday),weeklyDeadline(thursday));assert.equal(matchVotingDeadline(thursday)-matchVotingDeadline(monday),3*86400000);
});
test('explicit deadlines, timestamps and memory exclusions agree with server policy',()=>{
 const clips=[{createdAt:{toMillis:()=>1793908800000}},{highlightEra:'throwback',createdAtISO:'2099-01-01'}];
 for(const parent of [{},{weeklyVotingClosesAtISO:'2026-11-08T18:00:00Z'}])assert.equal(matchVotingDeadline(clips,parent),weeklyDeadline(clips,parent));
 assert.equal(matchVotingDeadline([{isThrowback:true,createdAtISO:'2026-11-06'}]),Infinity);
});
test('closed windows and minute countdowns are labelled without inventing dates',()=>{
 assert.equal(matchVotingLabel(1000,2000),'Match voting closed');assert.equal(matchVotingLabel(Infinity),'Voting time not set');assert.equal(matchVotingLabel(120000,0),'Voting · 2m left');assert.equal(matchVotingLabel(Date.now()+86400000,Date.now(),true),'Match voting closed');
});
