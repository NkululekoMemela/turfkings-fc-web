const test=require('node:test'),assert=require('node:assert/strict');
const {launchProfile,activateLaunchShop}=require('../functions/kitShopLaunchProfile.cjs');
test('launch bibs use established pricing and made-to-order availability without fictitious stock',()=>{
 const p=launchProfile();assert.equal(p.products.length,4);for(const item of p.products){assert.equal(item.priceMinor,9500);assert.equal(item.stock,0);assert.equal(item.madeToOrder,true);}
 assert.equal(p.settings.zones[0].feeMinor,0);assert.equal(p.settings.paymentMethod,'yoco');
});
test('launch activation rejects customers and preserves an already activated store',async()=>{
 await assert.rejects(()=>activateLaunchShop({isOperator:false}),/operator/);
 let writes=0;const db={doc:path=>({path}),runTransaction:fn=>fn({get:async()=>({data:()=>({launchProfileVersion:1})}),set:()=>writes++})};
 assert.deepEqual(await activateLaunchShop({db,user:{uid:'owner'},isOperator:true}),{ok:true,unchanged:true});assert.equal(writes,0);
});
