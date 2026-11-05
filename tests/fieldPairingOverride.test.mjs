import {test} from 'node:test';import assert from 'node:assert/strict';
import {planFieldPairing} from '../functions/fieldPairingPlan.mjs';
const season=()=>({status:'active',scheduleVersion:1,clubIds:['a','b','c','d','e'],matchDays:[{id:'day',status:'scheduled',fixtureIds:['ab','cd']},{id:'future',status:'scheduled',fixtureIds:['next']}],fixtures:[{id:'ab',matchDayId:'day',clubAId:'a',clubBId:'b',status:'scheduled'},{id:'cd',matchDayId:'day',clubAId:'c',clubBId:'d',status:'scheduled'},{id:'next',matchDayId:'future',clubAId:'a',clubBId:'c',status:'scheduled'}]});
const plan=(s,a='a',b='c')=>planFieldPairing({season:s,clubAId:a,clubBId:b,actorUid:'referee',now:123});
test('new pairing swaps remaining opponents and preserves fixture IDs, future fixtures and original data',()=>{const s=season(),before=structuredClone(s),p=plan(s);assert.deepEqual([p.fixture.clubAId,p.fixture.clubBId],['a','c']);assert.deepEqual([p.fixtures[1].clubAId,p.fixtures[1].clubBId],['b','d']);assert.deepEqual(p.fixtures[2],s.fixtures[2]);assert.deepEqual(s,before);assert.equal(p.changes.length,2);});
test('existing pairing selects without rewriting it',()=>assert.equal(plan(season(),'d','c').changes.length,0));
test('registered bye team can replace a team in an unplayed fixture',()=>assert.equal(plan(season(),'a','e').fixture.clubBId,'e'));
test('live, completed, identical and unregistered clubs cannot be rewritten',()=>{const s=season();s.fixtures[0].status='completed';assert.throws(()=>plan(s));assert.throws(()=>plan(season(),'a','a'));assert.throws(()=>plan(season(),'a','unknown'));const live=season();live.liveMatches={ab:{status:'live'}};assert.throws(()=>plan(live));});
test('pairing endpoint rejects spectators and missing confirmation before writes',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const {fixture}=require('./helpers/playerWorkflowFirestore.cjs'),{handler}=require('../functions/fieldPairingOverride.cjs');
 const f=fixture({'leagueVenues/v':{ownerUid:'owner',league:{activeSeason:{...season(),id:'s'}}}}),before=structuredClone([...f.records]);
 const req={method:'POST',headers:{authorization:'Bearer token'},body:{venueId:'v',seasonId:'s',clubAId:'a',clubBId:'c',confirmed:true}};
 const res={status(n){this.code=n;return this;},json(x){this.body=x;return this;}};
 await handler(req,res,{db:f.db,verifyToken:async()=>({uid:'spectator'})});assert.equal(res.code,400);assert.match(res.body.error,/approved Field official/);assert.deepEqual([...f.records],before);
 req.body.confirmed=false;await handler(req,res,{db:f.db,verifyToken:async()=>({uid:'owner'})});assert.match(res.body.error,/Confirm/);assert.deepEqual([...f.records],before);
});
