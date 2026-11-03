import test from 'node:test';import assert from 'node:assert/strict';
import {teamChatCacheKey,getTeamChatCache,putTeamChatCache,beginTeamChatWarm,endTeamChatWarm} from '../src/core/teamChatCache.mjs';
test('team preload is short-lived, in memory, and isolated by account, Club, Field, team and season',()=>{
 const room={id:'team',seasonId:'season'},key=teamChatCacheKey('user','club','',room),data={messages:[{text:'Tactics'}]};putTeamChatCache(key,data,1000);assert.equal(getTeamChatCache(key,1001),data);assert.equal(getTeamChatCache(key,21001),null);
 for(const other of [teamChatCacheKey('other','club','',room),teamChatCacheKey('user','other','',room),teamChatCacheKey('user','club','field',room),teamChatCacheKey('user','club','',{...room,id:'other'}),teamChatCacheKey('user','club','',{...room,seasonId:'next'})])assert.equal(getTeamChatCache(other,1001),null);
 assert.equal(beginTeamChatWarm(key),true);assert.equal(beginTeamChatWarm(key),false);endTeamChatWarm(key);assert.equal(beginTeamChatWarm(key),true);endTeamChatWarm(key);
});
