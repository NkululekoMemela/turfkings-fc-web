import test from 'node:test';import assert from 'node:assert/strict';
import {resolvePlayerPortrait,indexPlayerPortraits} from '../src/core/playerPortrait.mjs';
const players=[{id:'a',fullName:'Alex One',shortName:'Alex'},{id:'b',fullName:'Bea Two',shortName:'Bea'}];
test('decorated number labels never become shared portrait identities',()=>{
 const photos={'(-)':'wrong-face','(22)':'wrong-face',a:'alex-face',b:'bea-face'};
 assert.equal(resolvePlayerPortrait('Alex One',players,photos),'alex-face');assert.equal(resolvePlayerPortrait('Bea Two',players,photos),'bea-face');assert.equal(resolvePlayerPortrait('(-)',players,photos),null);assert.equal(resolvePlayerPortrait('Missing',players,photos),null);
});
test('same first names cannot borrow a teammate portrait; stable IDs and full names still resolve',()=>{
 const profiles=[...players,{id:'c',fullName:'Alex Three',shortName:'Alex'}],photos={a:'one',c:'three',Alex:'wrong'};
 assert.equal(resolvePlayerPortrait('Alex',profiles,photos),null);assert.equal(resolvePlayerPortrait('Alex One',profiles,photos),'one');assert.equal(resolvePlayerPortrait('Alex Three',profiles,photos),'three');
});
test('fresh photo documents index IDs, reject ambiguous aliases and never generate number-based aliases',()=>{
 const photos=indexPlayerPortraits([{id:'a',data:{name:'Alex One',photoUrl:'one'}},{id:'b',data:{name:'Bea Two',photoData:'two'}},{id:'c',data:{name:'(-)',photoData:'wrong'}}]);
 assert.equal(photos['(-)'],undefined);assert.equal(resolvePlayerPortrait('b',players,photos),'two');assert.equal(resolvePlayerPortrait('Alex One',players,photos),'one');
});
