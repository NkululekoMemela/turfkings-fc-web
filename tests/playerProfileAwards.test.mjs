import test from 'node:test';import assert from 'node:assert/strict';
import {buildFinalProfileVideoAwards} from '../src/core/playerProfileAwards.mjs';
const members=[{id:'a',fullName:'Alice'},{id:'b',fullName:'Bob'}];
const clip=(id,name,votes,more={})=>({clipId:id,matchId:'m',activeSeasonId:'S1',matchType:'LEAGUE',playerName:name,tag:'goal',weeklyVoteCount:votes,...more});
test('season finalization uses eligible archived ballots, preserves tied winners and never fabricates zero-vote awards',()=>{
 const result=buildFinalProfileVideoAwards({seasonId:'S1',members,clips:[clip('a','Alice',5),clip('b','Bob',5),clip('zero','Alice',0,{tag:'skill'}),clip('wrong','Alice',30,{activeSeasonId:'S2'}),clip('friendly','Alice',40,{matchType:'FRIENDLY'}),clip('guest','Unknown player',100)]});
 assert.equal(result.length,2);assert.equal(result[0].jointWinner,true);assert.equal(result[0].seasonWinner,true);assert.equal(result[0].awardName,'Puskas Award');
});
