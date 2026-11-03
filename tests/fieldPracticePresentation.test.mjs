import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceReminderVisible} from '../src/core/fieldPracticePresentation.mjs';
const start=Date.parse('2026-11-02T15:00:00Z'),expiry=start+900000;
test('practice reminder shows for the first fifteen seconds only',()=>{
 for(const elapsed of [-1,15000,59999,900000])assert.equal(practiceReminderVisible(expiry,start+elapsed),false);
 for(const elapsed of [0,10000,14999])assert.equal(practiceReminderVisible(expiry,start+elapsed),true);
});
test('a twelve-second reminder returns every session minute, including minute seven',()=>{
 for(let minute=1;minute<15;minute++){
  assert.equal(practiceReminderVisible(expiry,start+minute*60000),true);
  assert.equal(practiceReminderVisible(new Date(expiry).toISOString(),start+minute*60000+11999),true);
  assert.equal(practiceReminderVisible(expiry,start+minute*60000+12000),false);
 }
 assert.equal(practiceReminderVisible('invalid',start),false);
});
