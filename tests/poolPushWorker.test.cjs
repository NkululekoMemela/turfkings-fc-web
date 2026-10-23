const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('browser worker shows only the current account alert and rejects cross-origin notification taps',async()=>{
 const events={},shown=[],opened=[];let uid='host';
 const self={registration:{scope:'https://five-asides-near-me-development.web.app/pool-push/staging/',showNotification:async(title,options)=>shown.push({title,options})},location:{origin:'https://five-asides-near-me-development.web.app'},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},addEventListener:(name,fn)=>{events[name]=fn;}};
 const context=vm.createContext({self,URL,indexedDB:{},Promise});vm.runInContext(fs.readFileSync('public/pool-push-sw.js','utf8'),context);context.readAccount=()=>uid;vm.runInContext('store=async()=>readAccount()',context);
 const payload={type:'pool_alert',code:'12345ABCDE',recipientUid:'host',title:'Pool',body:'Join request',url:'https://five-asides-near-me-development.web.app/?poolNight=12345ABCDE',tag:'test'};
 async function push(data){let work;events.push({data:{json:()=>data},waitUntil:promise=>{work=promise;}});await work;}
 await push(payload);assert.equal(shown.length,1);assert.equal(shown[0].options.tag,'test');uid='other';await push(payload);assert.equal(shown.length,1);uid='host';await push({...payload,url:'https://evil.test/'});assert.equal(shown.length,1);
 let work;events.notificationclick({notification:{close(){},data:{url:'https://evil.test/',recipientUid:'host'}},waitUntil:promise=>{work=promise;}});await work;assert.deepEqual(opened,[]);
 events.notificationclick({notification:{close(){},data:{url:payload.url,recipientUid:'host'}},waitUntil:promise=>{work=promise;}});await work;assert.equal(opened[0],payload.url);
});
