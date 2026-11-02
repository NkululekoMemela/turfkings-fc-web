import test from 'node:test';import assert from 'node:assert/strict';
import {fieldFixtureStartTiming,assertFieldStartTiming} from '../functions/fieldStartTiming.mjs';
const season={matchSeconds:3600,matchDays:[{id:'day',dateLocal:'2026-11-04'}]};
const fixture={id:'fixture',matchDayId:'day',scheduledLocal:'2026-11-04T18:00'};
const check=(now,confirmed=false,overrides={})=>assertFieldStartTiming({season:{...season,...overrides},fixture,confirmed,now:Date.parse(now)});
test('outside window asks for confirmation with the Club 30-minute grace',()=>{
 for(const now of ['2026-11-03T18:00+02:00','2026-11-04T17:29+02:00','2026-11-04T19:31+02:00'])assert.throws(()=>check(now),/Confirm Official/);
 for(const now of ['2026-11-04T17:30+02:00','2026-11-04T19:30+02:00'])assert.doesNotThrow(()=>check(now));
});
test('one explicit confirmation allows an early fixture without changing season configuration',()=>{
 assert.doesNotThrow(()=>check('2026-11-03T18:00+02:00',true));assert.equal(season.allowEarlyStarts,undefined);
 assert.throws(()=>check('2026-11-03T18:00+02:00',false,{allowEarlyStarts:true}),/Confirm Official/);
 assert.throws(()=>check('2026-11-03T18:00+02:00','true'),/Confirm Official/);
});
test('timezone is Johannesburg regardless of browser timezone, explicit offsets are retained',()=>{
 assert.equal(fieldFixtureStartTiming({season,fixture,now:Date.parse('2026-11-04T15:30Z')}).needsConfirmation,false);
 assert.equal(fieldFixtureStartTiming({season,fixture:{...fixture,scheduledLocal:'2026-11-04T16:00Z'},now:Date.parse('2026-11-04T15:30Z')}).needsConfirmation,false);
 assert.throws(()=>fieldFixtureStartTiming({season,fixture:{...fixture,matchDayId:'missing'}}),/invalid date/);
});
