import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {fieldOperatingHoursLine,fieldHoursError} from '../src/core/fieldOperatingHours.mjs';
const require=createRequire(import.meta.url),{scheduleFromDraft}=require('../functions/fieldProfileUpdate.cjs');
const fail=message=>{throw Error(message);},today=Date.parse('2026-11-03T12:00:00Z');
for(const [opens,closes,valid]of [['08:00','22:00',true],['12:00','11:00',false],['12:00','12:00',false],['22:00','02:00',false],['24:00','25:00',false]])test(`browser and server agree on ${opens}–${closes}`,()=>{
 const operatingHours={Tuesday:{status:'open',opens,closes}};
 if(valid){assert.equal(fieldHoursError(operatingHours),'');assert.match(scheduleFromDraft({operatingHours},fail).operatingHoursSummary,/08:00–22:00/);}
 else{assert.ok(fieldHoursError(operatingHours));assert.throws(()=>scheduleFromDraft({operatingHours},fail));}
});
test('landing uses today’s full operating range rather than legacy match time',()=>{
 assert.equal(fieldOperatingHoursLine({weeklyPlayTime:'12:00',operatingHours:{Tuesday:{status:'open',opens:'08:00',closes:'22:00'}}},today),'Open 08:00–22:00');
 assert.equal(fieldOperatingHoursLine({weeklyPlayTime:'12:00'},today),'');
});
test('closed, 24-hour and nested schedules remain supported',()=>{
 assert.equal(fieldOperatingHoursLine({operatingHours:{Tuesday:{status:'closed'}}},today),'Closed today');
 assert.equal(fieldOperatingHoursLine({schedule:{operatingHours:{Tuesday:{status:'24h'}}}},today),'Open 24 hours');
 assert.equal(fieldHoursError({Tuesday:{status:'24h'}}),'');assert.equal(scheduleFromDraft({operatingHours:{Tuesday:{status:'24h'}}},fail).operatingHours.Tuesday.status,'24h');
});
test('day selection follows the Field timezone, including after UTC midnight boundaries',()=>{
 const field={timezone:'Africa/Johannesburg',operatingHours:{Wednesday:{status:'open',opens:'06:00',closes:'23:00'}}};
 assert.equal(fieldOperatingHoursLine(field,Date.parse('2026-11-03T22:30:00Z')),'Open 06:00–23:00');
});
test('legacy invalid overnight times request correction instead of displaying an approved range',()=>{
 assert.equal(fieldOperatingHoursLine({operatingHours:{Tuesday:{status:'open',opens:'22:00',closes:'02:00'}}},today),'');
});

test('empty root hours do not mask nested or raw profile data',()=>{
 const hours={Tuesday:{status:'open',opens:'07:00',closes:'21:00'}};
 assert.equal(fieldOperatingHoursLine({operatingHours:{},schedule:{operatingHours:hours}},today),'Open 07:00–21:00');
 assert.equal(fieldOperatingHoursLine({raw:{operatingHours:hours}},today),'Open 07:00–21:00');
});
test('legacy profiles show a genuine range, never an invented closing time',()=>{
 assert.equal(fieldOperatingHoursLine({schedule:{playTime:'08:00',playEndTime:'22:00'}},today),'Open 08:00–22:00');
 assert.equal(fieldOperatingHoursLine({weeklyPlayTime:'Wednesday · 17:30–19:00'},today),'Wednesday · 17:30–19:00');
 assert.equal(fieldOperatingHoursLine({playTime:'08:00'},today),'');
});
