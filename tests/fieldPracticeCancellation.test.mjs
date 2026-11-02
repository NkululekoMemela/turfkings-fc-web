import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fieldSeasonHasPlayRecords,fieldSeasonCancellationReason} from '../src/core/fieldSeasonLifecycle.js';
const source=fs.readFileSync(new URL('../src/storage/leagueSeasonRepository.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('export async function endVenueSeason('),source.indexOf('export async function deleteCurrentEmptyVenueSeason(')).replace('export async function','async function');
function harness({practice=true,played=false}={}){
 const writes=[],root=practice?'sandboxes/practice/leagueVenues/field/sessions/session':'leagueVenues/field';
 const season={id:'season',status:'active',results:played?[{status:'completed',fixtureId:'match'}]:[],liveMatches:{},fixtures:[],matchDayHistory:[],allEvents:[]};
 const records=new Map([[root,{ownerUid:'owner',league:{activeSeason:season}}]]);
 if(practice)records.set(root+'/seasons/season',season);
 const tx={get:async path=>({exists:()=>records.has(path),data:()=>records.get(path)}),set:(path,value)=>writes.push({op:'set',path,value}),delete:path=>writes.push({op:'delete',path}),update:(path,...value)=>writes.push({op:'update',path,value})};
 const args={auth:{currentUser:{uid:'owner'}},db:{},doc:(_db,path)=>path,runTransaction:async(_db,fn)=>fn(tx),venueLeagueRootPath:()=>root,requireFieldPracticeMatchSession:async()=>{},requireVenueStaffPower:async()=>{},fieldSeasonHasPlayRecords,fieldSeasonCancellationReason,FieldPath:class{constructor(...parts){this.parts=parts;}},serverTimestamp:()=>123,recordVenueAction:()=>{},crypto:{randomUUID}};
 const run=new Function(...Object.keys(args),code+';return endVenueSeason;')(...Object.values(args));
 return {writes,root,run,request:{venueId:'field',seasonId:'season',mode:'cancel',...(practice?{scope:{environment:'practice',venueId:'field',seasonId:'season',practiceSessionId:'session'}}:{})}};
}
test('unplayed Practice season resets without a reason or a cancelled season archive',async()=>{const h=harness();const next=await h.run(h.request);assert.notEqual(next.id,'season');assert(h.writes.some(w=>w.op==='delete'&&w.path===h.root+'/seasons/season'));assert(!h.writes.some(w=>w.op==='set'));assert(h.writes.every(w=>w.path.startsWith(h.root)));});
test('Official cancellation retains its audit archive and reason requirement',async()=>{const h=harness({practice:false});await assert.rejects(h.run(h.request),/10 to 500/);assert.equal(h.writes.length,0);await h.run({...h.request,cancellationReason:'Insufficient club signups'});assert(h.writes.some(w=>w.op==='set'&&w.value.status==='cancelled'));});
test('a played Practice season cannot be silently discarded',async()=>{const h=harness({played:true});await assert.rejects(h.run(h.request),/Play is recorded/);assert.equal(h.writes.length,0);});
