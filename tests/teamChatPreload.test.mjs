import test from 'node:test';import assert from 'node:assert/strict';
import {preloadTeamChat,cachedTeamRooms,teamRoomCacheKey} from '../src/core/teamChatPreload.mjs';
import {getTeamChatCache,teamChatCacheKey} from '../src/core/teamChatCache.mjs';
test('background warmup shares in-flight reads and provides immediate room and conversation snapshots without marking read',async()=>{
 const room={id:'red',seasonId:'s1'},calls=[];let release;const gate=new Promise(r=>release=r);
 const request=async body=>{calls.push(body);await gate;return body.action==='rooms'?{rooms:[room]}:{members:[{uid:'u'}],messages:[{text:'Tactics'}]};};
 const args={uid:'u',clubId:'club',request};const first=preloadTeamChat(args),second=preloadTeamChat(args);release();await Promise.all([first,second]);
 assert.equal(calls.filter(c=>c.action==='rooms').length,1);assert.equal(calls.find(c=>c.action==='messages').markRead,false);
 assert.deepEqual(cachedTeamRooms(teamRoomCacheKey('u','club')).rooms,[room]);assert.equal(getTeamChatCache(teamChatCacheKey('u','club','',room)).messages[0].text,'Tactics');
 for(const key of [teamRoomCacheKey('other','club'),teamRoomCacheKey('u','other'),teamRoomCacheKey('u','club','field')])assert.equal(cachedTeamRooms(key),null);
});
test('failed membership refresh discards cached rooms',async()=>{
 await preloadTeamChat({uid:'x',clubId:'club',request:async()=>({rooms:[]})});
 await assert.rejects(preloadTeamChat({uid:'x',clubId:'club',request:async()=>{throw Error('Removed');}}));
 assert.equal(cachedTeamRooms(teamRoomCacheKey('x','club')),null);
});
