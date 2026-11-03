import test from 'node:test';import assert from 'node:assert/strict';
import {openShopPaymentWindow} from '../src/core/shopPaymentWindow.mjs';
test('web checkout uses the returned secure Yoco URL',async()=>{
 let target;await openShopPaymentWindow('https://checkout.yoco.com/pay',{location:{assign:value=>target=value}});assert.equal(target,'https://checkout.yoco.com/pay');
});
test('native checkout preserves the app bill, refreshes on return, and removes its listener',async()=>{
 let closed,opened,removed=0,returned=0;
 const browser={addListener:async(event,fn)=>{assert.equal(event,'browserFinished');closed=fn;return {remove:async()=>{removed++;}};},open:async options=>{opened=options.url;}};
 await openShopPaymentWindow('https://checkout.yoco.com/pay',{native:true,browser,onReturn:()=>returned++,location:{assign:()=>{throw Error('must preserve app');}}});assert.equal(opened,'https://checkout.yoco.com/pay');closed();assert.equal(returned,1);assert.equal(removed,1);
});
test('a failed native browser leaves a retryable bill and cleans up',async()=>{
 let removed=false;await assert.rejects(openShopPaymentWindow('https://checkout.yoco.com/pay',{native:true,browser:{addListener:async()=>({remove:async()=>{removed=true;}}),open:async()=>{throw Error('native');}}}),/bill is saved/);assert.equal(removed,true);
});
test('unsafe destinations never navigate or open a native browser',async()=>{
 await assert.rejects(openShopPaymentWindow('https://yoco.com.attacker.invalid/pay',{location:{assign:()=>{throw Error('must not run');}}}),/Invalid/);
});
