import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let serial=0;
async function load(){
 globalThis.__exportNative=true;globalThis.__exportAvailable=['Filesystem','Share'];globalThis.__exportPlugins={};
 globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload();},()=>this.onerror());}};
 const result=await build({entryPoints:['src/core/saveFieldExport.js'],bundle:true,format:'esm',write:false,logLevel:'silent',plugins:[{name:'native-boundaries',setup(b){
  b.onResolve({filter:/^@capacitor\//},args=>({path:args.path,namespace:'fake-native'}));
  b.onLoad({filter:/.*/,namespace:'fake-native'},args=>({contents:args.path==='@capacitor/core'?'export const Capacitor={isNativePlatform:()=>globalThis.__exportNative,isPluginAvailable:name=>globalThis.__exportAvailable.includes(name)};export const registerPlugin=name=>globalThis.__exportPlugins[name];':args.path==='@capacitor/filesystem'?'export const Filesystem={writeFile:options=>globalThis.__exportWrite(options)};export const Directory={Documents:"documents",Cache:"cache"};':'export const Share={share:options=>globalThis.__exportShare(options)};'}));
 }}]});
 return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text+`\n// ${++serial}`).toString('base64')}`)).saveFieldExport;
}
test('PNG uses the installed image saver, rather than the removed FixtureImages plugin',async()=>{
 const save=await load();__exportAvailable.push('PoolImages');let name;
 __exportPlugins.PoolImages={savePng:async options=>{name=options.filename;return {saved:true};}};
 assert.deepEqual(await save(new Blob(['image'],{type:'image/png'}),'sheet.png'),{saved:true});assert.equal(name,'sheet.png');
});
test('PNG and PDF can both save through the native documents plugin',async()=>{
 const save=await load(),files=[];globalThis.__exportWrite=async options=>{files.push(options);return {uri:'content://saved'};};
 for(const [type,name]of [['image/png','sheet.png'],['application/pdf','sheet.pdf']])assert.equal((await save(new Blob(['content'],{type}),name)).saved,true);
 assert.deepEqual(files.map(f=>f.path),['FANM/sheet.png','FANM/sheet.pdf']);assert(files.every(f=>f.directory==='documents'));
});
test('blocked public storage falls back to the native save/share sheet without losing the PDF',async()=>{
 const save=await load();let shared;
 globalThis.__exportWrite=async options=>{if(options.directory==='documents')throw Error('Scoped storage');return {uri:'content://cached-pdf'};};
 globalThis.__exportShare=async options=>{shared=options;};
 assert.equal((await save(new Blob(['pdf'],{type:'application/pdf'}),'teamsheet.pdf')).shared,true);assert.deepEqual(shared.files,['content://cached-pdf']);
});
test('an outdated APK produces a clear update instruction instead of a generic rejection',async()=>{
 const save=await load();__exportAvailable=[];
 await assert.rejects(save(new Blob(['pdf'],{type:'application/pdf'}),'teamsheet.pdf'),/Update the Android app/);
});
