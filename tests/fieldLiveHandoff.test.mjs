import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKitRoster,validateKitTeams,numberForName,kitRosterSignature} from '../functions/playerKitPolicy.mjs';
import {resolvePlayerPortrait} from '../src/core/playerPortrait.mjs';
import {tickFieldMatchClock} from '../src/core/fieldMatchClock.js';
const players=Array.from({length:6},(_,i)=>({id:`club::p${i}`,sourcePlayerId:`p${i}`,clubId:'club',fullName:`Player ${i}`,shortName:`P${i}`,jerseyNumber:i===5?22:i+1,photoData:`face-${i}`}));
const team={id:'club',clubId:'club',players};
const snapshot={club:{positions:Object.fromEntries(players.slice(0,5).map((p,i)=>[`pos${i}`,p.fullName])),benchSnapshot:[players[5].fullName]}};
test('approved players survive formation and confirmed lineup aliases without duplicate numberless rows',()=>{
 const formations=buildKitRoster([team],players);
 const live=buildKitRoster([team],[],snapshot);
 assert.equal(live[0].players.length,6);
 assert.equal(kitRosterSignature(live),kitRosterSignature(formations));
 assert.deepEqual(live[0].players.map(p=>p.number),[1,2,3,4,5,22]);
 assert.doesNotThrow(()=>validateKitTeams(live,{referee:true,requireNumbered:true}));
 for(const p of players)assert.equal(numberForName(live,p.fullName,'club'),`(${p.jerseyNumber})`);
});
test('approved match portrait wins over a stale name photo and belongs to each distinct player',()=>{
 for(const p of players)assert.equal(resolvePlayerPortrait(p.fullName,players,{[p.fullName]:'stale'}),p.photoData);
 assert.equal(resolvePlayerPortrait('Unknown',players,{'(-)':'someone'}),null);
});
test('the same player name on opposing sides retains independent match numbers',()=>{
 const other={id:'other',clubId:'other',players:[{...players[0],id:'other::p0',clubId:'other',jerseyNumber:6}]};
 const result=buildKitRoster([team,other],[],{...snapshot,other:{positions:{one:'Player 0'}}});
 assert.equal(numberForName(result,'Player 0','club'),'(1)');assert.equal(numberForName(result,'Player 0','other'),'(6)');
});
test('a verified running clock ticks while an awaiting confirmation clock stays paused',()=>{
 const live={status:'live',clockVersion:1,clockPhase:'first_half',matchSeconds:2400,secondsLeft:2400,running:false,timeUp:false};
 assert.equal(tickFieldMatchClock(live).secondsLeft,2400);
 assert.equal(tickFieldMatchClock({...live,running:true}).secondsLeft,2399);
});
