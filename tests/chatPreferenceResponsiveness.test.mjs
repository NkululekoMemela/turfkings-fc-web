import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let instance=0;
async function load(){
 globalThis.__chatAuth={currentUser:{uid:'player'}};globalThis.__chatPolicyCalls=0;globalThis.__chatEligible=true;globalThis.__chatStop=false;
 const output=await build({entryPoints:['src/core/chatNotificationPreferences.js'],bundle:true,format:'esm',write:false,logLevel:'silent',plugins:[{name:'chat-boundaries',setup(b){
  b.onResolve({filter:/firebaseConfig\.js$/},()=>({path:'config',namespace:'fake'}));b.onResolve({filter:/memberWorkspaceGateway\.js$/},()=>({path:'gateway',namespace:'fake'}));b.onResolve({filter:/^firebase\/firestore$/},()=>({path:'firestore',namespace:'fake'}));
  b.onLoad({filter:/.*/,namespace:'fake'},args=>({contents:args.path==='config'?'export const auth=globalThis.__chatAuth;export const db={};':args.path==='gateway'?'export async function memberWorkspaceRequest(){globalThis.__chatPolicyCalls++;return {eligible:globalThis.__chatEligible,defaultMuted:false};}':'export const doc=(...parts)=>parts;export const serverTimestamp=()=>1;export const getDoc=async()=>({data:()=>({})});export const setDoc=async()=>{};export function onSnapshot(ref,cb){globalThis.__chatSnapshot=cb;return()=>{globalThis.__chatStop=true;};}'}));
 }}]});
 return await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text+`\n// ${++instance}`).toString('base64')}`);
}
test('Field mute changes reuse one eligibility lookup rather than fetching again on every tap',async()=>{
 const module=await load(),values=[];const stop=module.watchChatPreference('player','field','field',muted=>values.push(muted));
 for(const muted of [false,true,false]){await __chatSnapshot({data:()=>({muted})});}
 assert.deepEqual(values,[false,true,false]);assert.equal(__chatPolicyCalls,1);stop();assert(__chatStop);
});
test('ineligible users are shown unavailable alerts rather than a misleading unmute action',async()=>{
 const module=await load();__chatEligible=false;let result;
 module.watchChatPreference('player','field','field',(muted,policy)=>{result={muted,...policy};});
 await __chatSnapshot({data:()=>({muted:false})});assert.deepEqual(result,{muted:true,canChange:false});
});
test('a different signed-in account cannot receive the previous account’s preference response',async()=>{
 const module=await load();let updates=0;module.watchChatPreference('player','field','field',()=>updates++);
 __chatAuth.currentUser.uid='different';await __chatSnapshot({data:()=>({muted:true})});assert.equal(updates,0);
});
