import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDestination,selectNotificationCredit} from '../src/core/notificationDestination.mjs';
test('story and poll links retain exact Club and article targets',()=>{
 for(const [type,id] of [['club_story','storyId'],['club_poll','pollId']]){
  const d=notificationDestination({type,clubId:'club', [id]:'specific'});assert.equal(d.kind,'news');assert.equal(d[id],'specific');assert.equal(d.clubId,'club');
 }
 assert.equal(notificationDestination({type:'club_story',clubId:'club',storyId:'../other'}),null);
 assert.equal(notificationDestination({type:'club_story',clubId:'club'}),null);
});
test('cancellation and issued-ticket links open Signup with credit/match focus',()=>{
 assert.deepEqual(notificationDestination({type:'match_day_cancelled',clubId:'club',matchDayId:'week'}),{kind:'ticket',clubId:'club',creditId:'',matchDayId:'week'});
 assert.equal(notificationDestination({type:'match_ticket_available',clubId:'club',creditId:'credit'}).creditId,'credit');
 assert.equal(notificationDestination({type:'club_chat',clubId:'club'}),null);
});
test('ticket focus only selects a matching credit from the current player wallet',()=>{
 const credits=[{id:'one',sourceWeekId:'week',sourceType:'admin_exception'},{id:'two',sourceWeekId:'week',sourceType:'match_cancelled'}];
 assert.equal(selectNotificationCredit(credits,{matchDayId:'week'}).id,'two');
 assert.equal(selectNotificationCredit(credits,{creditId:'someone-elses-ticket',matchDayId:'week'}),null);
 assert.equal(selectNotificationCredit([], {creditId:'two'}),null);
});
test('exhibition notices keep the exact Club and fixture for Signup',()=>{
 const fixtureId='b'.repeat(64);
 assert.deepEqual(notificationDestination({type:'club_exhibition_accepted',clubId:'club',fixtureId}),{kind:'exhibition',clubId:'club',fixtureId});
 assert.equal(notificationDestination({type:'club_exhibition_cancelled',clubId:'club',fixtureId:'not-a-fixture'}),null);
});

test('challenge invitations open the exact Club inbox, not match signup',()=>{
 const fixtureId='a'.repeat(64);
 assert.deepEqual(notificationDestination({type:'club_exhibition_invitation',clubId:'turf-kings',fixtureId}),
  {kind:'challenge-invitation',clubId:'turf-kings',fixtureId});
 assert.equal(notificationDestination({type:'club_exhibition_invitation',clubId:'turf-kings',fixtureId:'../../other'}),null);
});
