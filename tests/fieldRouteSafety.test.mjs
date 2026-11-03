import test from 'node:test';import assert from 'node:assert/strict';import {fieldNavigationReady,fieldNeedsSeason,safeFieldSeason,fieldMatchDays,fieldDateLabel} from '../src/core/fieldRouteSafety.mjs';
test('spectators do not need an operator-only session choice to get their navigation',()=>{
 assert.equal(fieldNavigationReady({identity:{role:'spectator'},choice:'choose',canChooseSession:false}),true);assert.equal(fieldNavigationReady({identity:null,choice:'official',canChooseSession:false}),false);assert.equal(fieldNavigationReady({identity:{role:'field_manager'},choice:'choose',canChooseSession:true}),false);assert.equal(fieldNavigationReady({identity:{},choice:'practice',canChooseSession:true}),true);
});
test('empty Fields provide a season prerequisite without blocking settings, news or bookings',()=>{
 for(const page of ['squads','formations','stats','fixtures','videos','live'])assert.equal(fieldNeedsSeason(page,null),true);
 for(const page of ['landing','settings','news','signup','chat'])assert.equal(fieldNeedsSeason(page,null),false);
 assert.equal(fieldNeedsSeason('squads',{id:'season'}),false);
});
test('malformed and missing season collections cannot reach renderers as non-arrays',()=>{
 assert.equal(safeFieldSeason(null),null);const result=safeFieldSeason({id:'s',fixtures:{},matchDays:[null,{id:'d'}],clubIds:[null,'club'],results:[null]});assert.deepEqual(result.fixtures,[]);assert.deepEqual(result.clubIds,['club']);assert.deepEqual(result.matchDays,[]);assert.deepEqual(fieldMatchDays(null),[]);assert.equal(fieldDateLabel('broken'),'');
});
test('draft seasons do not open match renderers before fixtures exist',async()=>{
 const {fieldEmptyRouteMessage}=await import('../src/core/fieldRouteSafety.mjs');for(const page of ['squads','formations','live'])assert.equal(fieldEmptyRouteMessage(page,{id:'draft',fixtures:[],results:[],matchDayHistory:[]}),'Fixtures are not published yet');assert.equal(fieldEmptyRouteMessage('stats',{id:'draft'}),'');assert.equal(fieldEmptyRouteMessage('live',{id:'s',results:[{id:'last'}]}),'');
});
