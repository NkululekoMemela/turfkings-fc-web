import test from 'node:test';import assert from 'node:assert/strict';
import {clubBrowseMode,exhibitionInClubBrowse} from '../src/core/clubBrowseMode.mjs';
import {groupHighlightFixtures,highlightFixtureOptions,highlightMatchesMode} from '../src/core/highlightFixtures.mjs';
import {bibStockRows,nextBibAssignments} from '../src/core/fieldBibStock.mjs';
import {fieldOpenMatchDays} from '../src/core/fieldRouteSafety.mjs';
import {fieldHighlightAttachment} from '../src/core/fieldHighlightAttachment.mjs';
import {jpegPagesToPdf} from '../src/core/fieldTeamsheetExport.mjs';
const choice=Object.freeze({clubId:'a',uid:'u',published:'LEAGUE',value:'FRIENDLY'});
test('personal mode changes the common view type without mutating the published Club configuration',()=>{const settings=Object.freeze({published:'LEAGUE',choice,clubId:'a',uid:'u',canManage:false});assert.equal(clubBrowseMode(settings),'FRIENDLY');assert.equal(settings.published,'LEAGUE');assert.equal(choice.value,'FRIENDLY');for(const patch of [{uid:'other'},{clubId:'other'},{canManage:true},{choice:{...choice,value:'invalid'}}])assert.equal(clubBrowseMode({...settings,...patch}),'LEAGUE');});
test('fixture groups remain contiguous and selected games never leak another fixture',()=>{const clips=[{id:'one',matchId:'a'},{id:'two',matchId:'b'},{id:'three',matchId:'a'}];assert.deepEqual(groupHighlightFixtures(clips).map(c=>c.id),['one','three','two']);assert.deepEqual(groupHighlightFixtures(clips,'b').map(c=>c.id),['two']);assert.deepEqual(clips.map(c=>c.id),['one','two','three']);});
test('fixture labels retain the exact requested match and date, including reverse fixtures',()=>{const fixtures=[{matchId:'first',label:'A vs B',date:'2026-11-04'},{matchId:'return',label:'B vs A',date:'2026-11-11'}];const options=highlightFixtureOptions([{matchId:'first'}],fixtures);assert.equal(options.length,2);assert.equal(options[0].matchId,'return');assert.equal(options[1].label,'A vs B');});
test('stock is grouped into real quantities by colour and bib number',()=>{const rows=bibStockRows([{color:'Blue',number:1,quantity:2},{color:'Blue',number:2,quantity:1},{color:'Orange',number:1,quantity:0}]);assert.equal(rows.length,2);assert.deepEqual(rows[0].numbers,{1:2,2:1});assert.equal(rows[0].total,3);assert.equal(rows[1].total,0);});
test('completed roster colour falls back to actual player bibs, numbers sort and byes stay out',()=>{assert.deepEqual(nextBibAssignments([{clubId:'a',name:'Alpha',players:[{jerseyNumber:6,matchBib:{color:'Orange',number:6}},{jerseyNumber:1,bibColor:'Orange'}]},{clubId:'b',status:'bye'}]),[{clubId:'a',name:'Alpha',color:'Orange',numbers:[1,6],ready:true}]);});
test('next stock assignments exclude already closed matchdays',()=>{const days=fieldOpenMatchDays({matchDays:[{id:'old',dateLocal:'2026-11-04',status:'scheduled'},{id:'next',dateLocal:'2026-11-11',status:'scheduled'}],matchDayHistory:[{scheduledMatchDayId:'old'}]});assert.equal(days[0].id,'next');});
test('chat attachment has precisely the allowed public keys and no owner or metadata extras',()=>{const clip={kind:'highlight',venueId:'v',clipId:'clip',matchId:'venue__v__s__f',mediaUrl:'https://example.com/video.mp4',title:'Goal',ownerUid:'u',type:'goal'};const attachment=fieldHighlightAttachment(clip,'v');assert.deepEqual(Object.keys(attachment).sort(),['kind','venueId','clipId','matchId','title','mediaUrl'].sort());assert.equal(attachment.kind,'highlight');assert.throws(()=>fieldHighlightAttachment(clip,'other'));assert.throws(()=>fieldHighlightAttachment({...clip,mediaUrl:'javascript:bad'},'v'));});
test('PDF export preserves the original teamsheet aspect ratio',async()=>{const pdf=jpegPagesToPdf([{width:1520,height:1200,bytes:Uint8Array.of(255,216,255,217)}]);const text=await pdf.text();const transform=text.match(/q ([\d.]+) 0 0 ([\d.]+) [\d.]+ [\d.]+ cm/);assert.ok(transform);assert.ok(Math.abs(Number(transform[1])/Number(transform[2])-1520/1200)<.001);});

test('video views follow League/Friendly while preserving unclassified historical clips',()=>{assert.equal(highlightMatchesMode({matchId:'league__2026-S1__m1'},'FRIENDLY'),false);assert.equal(highlightMatchesMode({matchType:'FRIENDLY'},'LEAGUE'),false);assert.equal(highlightMatchesMode({matchId:'friendly_5v5_2026-11-11'},'FRIENDLY'),true);assert.equal(highlightMatchesMode({},'LEAGUE'),true);});

test('signed-out spectators can browse either tab without changing the published mode',()=>{
 const defaults={published:'FRIENDLY',clubId:'a',canManage:false};
 assert.equal(clubBrowseMode(defaults),'FRIENDLY');
 const choice={clubId:'a',uid:null,published:'FRIENDLY',value:'LEAGUE'};
 assert.equal(clubBrowseMode({...defaults,choice}),'LEAGUE');
 assert.equal(clubBrowseMode({...defaults,choice:{...choice,published:'LEAGUE'}}),'FRIENDLY');
 assert.equal(clubBrowseMode({...defaults,choice,uid:'player'}),'FRIENDLY');
 assert.equal(clubBrowseMode({...defaults,choice,clubId:'different'}),'FRIENDLY');
});
test('an exhibition stays in the published view and does not mask the other tab',()=>{
 const exhibition={fixtureId:'cup'};
 for(const [published,alternate] of [['FRIENDLY','LEAGUE'],['LEAGUE','FRIENDLY']]){
  assert.equal(exhibitionInClubBrowse({exhibition,published,browsing:published}),exhibition);
  assert.equal(exhibitionInClubBrowse({exhibition,published,browsing:alternate}),null);
 }
});
