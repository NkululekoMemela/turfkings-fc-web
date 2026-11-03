const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){const pending=[],auth={currentUser:{uid:'one',getIdToken:async()=> 'token'}};
 const context={auth,getActiveFirebaseFunctionsBaseUrl:()=> 'https://example.test',AbortController,window:{setTimeout,clearTimeout},fetch:async(_url,opts)=>new Promise(resolve=>pending.push({body:JSON.parse(opts.body),resolve:value=>resolve({ok:true,json:async()=>value})}))};
 let code=fs.readFileSync(require.resolve('../src/storage/fieldTeamPaymentRepository.js'),'utf8').replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"\n]+";/,'').replace('export function fieldTeamPaymentRequest','function fieldTeamPaymentRequest');vm.runInNewContext(code+'\nthis.request=fieldTeamPaymentRequest;',context);return {...context,pending};}
test('simultaneous payment reads share a request and mutations invalidate earlier cached views',async()=>{
 const f=setup(),a=f.request('field','signupView'),b=f.request('field','signupView');await flush();assert.equal(f.pending.length,1);f.pending[0].resolve({paid:false});assert.deepEqual(await a,await b);
 const m=f.request('field','confirmPayment');await flush();f.pending[1].resolve({ok:true});await m;
 const next=f.request('field','signupView');await flush();assert.equal(f.pending.length,3);f.pending[2].resolve({paid:true});assert.equal((await next).paid,true);
});
test('a slow read cannot repopulate stale cache after a payment mutation',async()=>{
 const f=setup(),old=f.request('field','signupView');await flush();const mutation=f.request('field','update');await flush();f.pending[1].resolve({ok:true});await mutation;f.pending[0].resolve({paid:false});await old;
 const next=f.request('field','signupView');await flush();assert.equal(f.pending.length,3);f.pending[2].resolve({paid:true});assert.equal((await next).paid,true);
});
test('responses from a previous account cannot be returned to the new account',async()=>{
 const f=setup(),read=f.request('field','signupView');await flush();f.auth.currentUser={uid:'two'};f.pending[0].resolve({secret:'old account'});await assert.rejects(read,/account changed/);
});
