import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clubFounderName} from '../src/core/clubFounderCredit.mjs';
test('club creator receives credit even when another admin is first or delegated',()=>{
 const club={createdByUid:'creator',delegatedAdminName:'Other Admin'};
 const admins=[{uid:'other',fullName:'Other Admin'},{uid:'creator',fullName:'Nkululeko Memela'}];
 assert.equal(clubFounderName(club,admins),'Nkululeko Memela');
 assert.equal(clubFounderName(club,[...admins].reverse()),'Nkululeko Memela');
});
test('recorded founder precedes main admin; legacy club falls back without inventing a person',()=>{
 assert.equal(clubFounderName({founderFirstName:'Asha',founderSurname:'Dube',mainAdminName:'Other'}),'Asha Dube');
 assert.equal(clubFounderName({mainAdminName:'Mpho'}),'Mpho');
 assert.equal(clubFounderName({}), '');
});
