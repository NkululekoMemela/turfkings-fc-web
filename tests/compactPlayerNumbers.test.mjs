import test from 'node:test';import assert from 'node:assert/strict';
import {buildKitRoster,labelWithNumber,validateKitTeams} from '../functions/playerKitPolicy.mjs';
test('labels use brackets, preserve real zero, and use a short dash for unassigned players',()=>{
 const roster=buildKitRoster([{id:'A',players:['p1','p2','p3']}],[{id:'p1',fullName:'Alex',jerseyNumber:0},{id:'p2',fullName:'Bea',jerseyNumber:23},{id:'p3',fullName:'Cal'}]);
 assert.equal(labelWithNumber(roster,'Alex','Alex','A'),'(0) Alex');assert.equal(labelWithNumber(roster,'Bea','Bea','A'),'(23) Bea');assert.equal(labelWithNumber(roster,'Cal','Cal','A'),'(-) Cal');
});
test('switching off match numbers leaves official profile numbers and saved match overrides intact',()=>{
 const profiles=[{id:'p1',fullName:'Alex',jerseyNumber:8},{id:'p2',fullName:'Bea',jerseyNumber:8}],team={id:'A',players:['p1','p2'],usePlayerNumbers:false,kitNumbers:{p1:{number:12}}};
 const roster=buildKitRoster([team],profiles);assert.ok(roster[0].players.every(p=>p.number===null));assert.doesNotThrow(()=>validateKitTeams(roster));assert.equal(profiles[0].jerseyNumber,8);assert.equal(team.kitNumbers.p1.number,12);
});
test('a compact confirmation can mark numbers unused in Club matches, but official Field numbered-bib policy stays mandatory',()=>{
 const teams=[{id:'A',players:[{key:'p',name:'Alex',number:null,noNumberReason:'not_used'}]}];
 assert.doesNotThrow(()=>validateKitTeams(teams,{referee:true}));assert.throws(()=>validateKitTeams(teams,{referee:true,requireNumbered:true}),/visible numbered bib/);
});
