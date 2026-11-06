import test from 'node:test';import assert from 'node:assert/strict';
import {readStockView,saveStockView} from '../src/core/fieldStockViewCache.mjs';
import {filterHighlightClips,highlightFixtureOptions} from '../src/core/highlightFixtures.mjs';
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
test('saved stock is isolated by project, account, Field and Club',()=>{
 const cache=storage(),value={venueId:'field',config:{stock:[{color:'Blue',number:1,quantity:6}]},orders:[{customer:{phone:'private'}}]};
 saveStockView(cache,'staging','uid','field','',value,123);
 assert.equal(readStockView(cache,'staging','uid','field').at,123);
 assert.equal(readStockView(cache,'production','uid','field'),null);assert.equal(readStockView(cache,'staging','other','field'),null);assert.equal(readStockView(cache,'staging','uid','other'),null);assert.equal(readStockView(cache,'staging','uid','field','club'),null);
 assert.deepEqual(readStockView(cache,'staging','uid','field').value.orders,[]);
});
test('blocked or damaged local storage cannot prevent stock from loading',()=>{
 assert.equal(readStockView({getItem:()=>{throw Error('blocked');}},'p','u','f'),null);
 assert.doesNotThrow(()=>saveStockView({setItem:()=>{throw Error('full');}},'p','u','f','',{venueId:'f',config:{stock:[]}}));
 assert.equal(readStockView({getItem:()=>'{broken'},'p','u','f'),null);
});
test('outside filters narrow match previews and feeds consistently, including watched goals',()=>{
 const clips=[{id:'one',matchId:'a',normalizedType:'goal',scorer:'Player One'},{id:'two',matchId:'b',normalizedType:'save',playerName:'Player One'},{id:'three',matchId:'b',normalizedType:'goal',playerName:'Other'}];
 const filtered=filterHighlightClips(clips,{type:'goal',player:'player one',viewed:'watched',watchedIds:new Set(['one'])});
 assert.deepEqual(filtered.map(clip=>clip.id),['one']);const groups=highlightFixtureOptions(filtered);assert.equal(groups.length,1);assert.equal(groups[0].matchId,'a');
 assert.equal(filterHighlightClips(clips,{viewed:'unwatched',watchedIds:new Set(['one'])}).length,2);
});
