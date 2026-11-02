import test from 'node:test';import assert from 'node:assert/strict';
import {matchTeamCaption} from '../src/core/matchTeamCaption.mjs';
test('captain objects use a human name instead of object coercion',()=>{assert.equal(matchTeamCaption({label:'Turf Kings',captain:{fullName:'Nkuleleko Memela'}}),'Turf Kings (c: Nkuleleko Memela)');});
test('missing and unrecognised captains do not leave empty labels',()=>{for(const captain of [undefined,{},null,'  '])assert.equal(matchTeamCaption({label:'France',captain}),'France');});
test('existing string captains and name fallbacks remain usable',()=>{assert.equal(matchTeamCaption({name:'Brazil',captain:'Jo'}),'Brazil (c: Jo)');assert.equal(matchTeamCaption({label:'Club',captain:{name:'Captain'}}),'Club (c: Captain)');});
