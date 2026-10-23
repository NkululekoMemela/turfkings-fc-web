const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const cwd=path.resolve(__dirname,'../functions');
function run(script,target='kitShop'){
 const result=spawnSync(process.execPath,['-e',script],{cwd,env:{...process.env,GCLOUD_PROJECT:'demo-fanm-kit-shop',FUNCTION_TARGET:target},encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr||result.stdout||'Startup timed out');
 return JSON.parse(result.stdout);
}
test('Shop target starts without importing the shared club/field/payment entry point',()=>{
 const result=run(`const f=require('./functionsBootstrap.cjs');console.log(JSON.stringify({keys:Object.keys(f),endpoint:f.kitShop.__endpoint,legacyLoaded:Boolean(require.cache[require.resolve('./index.js')]),shopServiceLoaded:Boolean(require.cache[require.resolve('./kitShop.cjs')])}));process.exit(0);`);
 assert.deepEqual(result.keys,['kitShop']);assert.equal(result.legacyLoaded,false);assert.equal(result.shopServiceLoaded,false);assert.equal(result.endpoint.platform,'gcfv2');assert.deepEqual(result.endpoint.region,['us-central1']);
});
test('discovery and existing targets keep the complete original function export object',()=>{
 for(const target of ['', 'playerPrivacy', 'clubPlayerNumbers']){
  const result=run(`const f=require('./functionsBootstrap.cjs'),original=require('./index.js');console.log(JSON.stringify({same:f===original,profile:typeof f.playerPrivacy,shop:typeof f.kitShop,numbers:typeof f.clubPlayerNumbers}));process.exit(0);`,target);
  assert.equal(result.same,true);assert.equal(result.profile,'function');assert.equal(result.shop,'function');assert.equal(result.numbers,'function');
 }
});
test('Shop HTTP endpoint rejects unsigned requests without loading the Shop service',()=>{
 const result=run(`const {EventEmitter}=require('node:events');const {kitShop}=require('./functionsBootstrap.cjs');const res=new EventEmitter();let headers={};res.setHeader=(k,v)=>headers[k]=v;res.getHeader=k=>headers[k];res.set=(k,v)=>{headers[k]=v;return res;};res.status=n=>{res.code=n;return res;};res.json=body=>{console.log(JSON.stringify({code:res.code,body,cache:headers['Cache-Control'],shopServiceLoaded:Boolean(require.cache[require.resolve('./kitShop.cjs')])}));res.emit('finish');};kitShop({method:'POST',headers:{}},res).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});`);
 assert.equal(result.code,401);assert.equal(result.body.error,'Sign in to the shop.');assert.equal(result.cache,'no-store');assert.equal(result.shopServiceLoaded,false);
});
