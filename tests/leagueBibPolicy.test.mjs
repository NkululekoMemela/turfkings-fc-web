import {test} from 'node:test';import assert from 'node:assert/strict';
import {leagueBibIssues,assertLeagueBibs,leagueSubmissionDeadline} from '../functions/leagueBibPolicy.mjs';
import {validateKitTeams,NO_NUMBER_REASONS} from '../functions/playerKitPolicy.mjs';
const player={sourcePlayerId:'p',fullName:'Alex',ownsNumberedBib:true,bibColor:'Blue',jerseyNumber:0};
test('real numbered bib zero is valid; ownership is independent of Shop orders',()=>{assert.deepEqual(leagueBibIssues([player]),[]);assert.doesNotThrow(()=>assertLeagueBibs([player],{p:0}));});
test('jerseys, a paid order and captain-entered numbers cannot replace numbered bib ownership',()=>{for(const patch of [{ownsNumberedBib:false,ownsHomeShirt:true},{ownsNumberedBib:false,orderStatus:'delivered'},{ownsNumberedBib:'yes'},{jerseyNumber:null},{bibColor:''}])assert.ok(leagueBibIssues([{...player,...patch}],{p:12}).length);});
test('missing, duplicate and different physical bib numbers are rejected',()=>{
 assert.throws(()=>assertLeagueBibs([player],{p:null}),/visible bib number/);assert.throws(()=>assertLeagueBibs([player],{p:12}),/must match/);assert.throws(()=>assertLeagueBibs([player,{...player,sourcePlayerId:'q',fullName:'Sam'}]),/cannot share/);
});
test('deadline is exactly 24 hours before the ZA fixture kickoff',()=>{assert.equal(new Date(leagueSubmissionDeadline('2030-10-10T18:00')).toISOString(),'2030-10-09T16:00:00.000Z');assert.throws(()=>leagueSubmissionDeadline('invalid'));});
test('official Field referee checks refuse unnumbered exceptions while social games retain them',()=>{
 const teams=[{id:'club',players:[{key:'p',name:'Alex',number:null,noNumberReason:'inside_out'}]}];
 assert.doesNotThrow(()=>validateKitTeams([{...teams[0],players:[{...teams[0].players[0],noNumberReason:Object.keys(NO_NUMBER_REASONS)[0]}]}],{referee:true}));
 assert.throws(()=>validateKitTeams(teams,{referee:true,requireNumbered:true}),/visible numbered bib/);
 assert.doesNotThrow(()=>validateKitTeams([{...teams[0],players:[{...teams[0].players[0],number:0}]}],{referee:true,requireNumbered:true}));
});
