import test from 'node:test';import assert from 'node:assert/strict';
import {bibPackAudit} from '../src/core/fieldBibStock.mjs';
import {highlightFixtureOptions} from '../src/core/highlightFixtures.mjs';
test('quick stock-take recognises complete six/twelve packs and highlights shortages',()=>{
 const rows=[{color:'Blue',number:1,quantity:5},{color:'Orange',number:1,quantity:6},{color:'Green',number:1,quantity:12},{color:'Red',number:1,quantity:10}];
 const audit=bibPackAudit(rows);assert.equal(audit[0].missing,1);assert.equal(audit[1].complete,true);assert.equal(audit[2].complete,true);assert.equal(audit[3].missing,2);
});
test('preview containers deduplicate clips within their exact fixture',()=>{
 const a={id:'clip',matchId:'a',mediaUrl:'https://example.com/a.mp4',scorer:'Player',type:'goal'};
 const groups=highlightFixtureOptions([a,a,{...a,id:'other',matchId:'b'}]);
 assert.equal(groups.find(g=>g.matchId==='a').clipCount,1);assert.equal(groups.find(g=>g.matchId==='a').previews[0].label,'Player');assert.equal(groups.find(g=>g.matchId==='b').clipCount,1);
});
