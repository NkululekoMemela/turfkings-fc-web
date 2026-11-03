import test from 'node:test';import assert from 'node:assert/strict';import {clubCategory,clubsInCategory} from '../src/core/clubCategory.mjs';
test('Company and Community carousel data never mix, including incomplete Company records',()=>{
 const clubs=[{id:'legacy'},{id:'community',clubType:'community'},{id:'company',clubType:'company',companyId:'co',companyStatus:'active'},{id:'pending',clubType:'company',companyStatus:'pending'}];
 assert.deepEqual(clubsInCategory(clubs,'community').map(c=>c.id),['legacy','community']);assert.deepEqual(clubsInCategory(clubs,'company').map(c=>c.id),['company']);assert.equal(clubCategory(clubs[3]),'unavailable');assert.deepEqual(clubsInCategory(null,'company'),[]);
});
