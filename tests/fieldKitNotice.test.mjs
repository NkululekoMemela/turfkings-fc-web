import test from 'node:test';import assert from 'node:assert/strict';
import {noticePhase,squadKitSummary} from '../functions/fieldKitNotice.mjs';
const kickoff=Date.parse('2026-11-04T18:00:00+02:00');
const day={id:'d'},fixtures=[{matchDayId:'d',status:'scheduled',scheduledLocal:'2026-11-04T18:00:00'}];
test('captain and Field reminders use distinct 24h and 16h windows',()=>{
 assert.equal(noticePhase(day,fixtures,kickoff-24*3600000),'captain');
 assert.equal(noticePhase(day,fixtures,kickoff-16*3600000),'admin');
 assert.equal(noticePhase(day,fixtures,kickoff-15*3600000),'');
 assert.equal(noticePhase(day,fixtures.map(f=>({...f,status:'completed'})),kickoff-24*3600000),'');
});
test('squad notification includes assigned colours and numbers without invented numbers',()=>{
 assert.equal(squadKitSummary([{fullName:'One',jerseyNumber:22,bibColor:'Blue'},{fullName:'Two'}]),'Wear Blue · (22) One, Two');
});
