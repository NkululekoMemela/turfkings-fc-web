export async function openShopPaymentWindow(url,{native=false,browser=null,location=null,onReturn=()=>{}}={}){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!/(^|\.)yoco\.com$/.test(parsed.hostname))throw Error('Invalid Yoco payment destination.');
 if(!native){location.assign(parsed.href);return;}
 if(!browser)throw Error('The payment browser is unavailable. Your bill is saved.');
 const listener=await browser.addListener('browserFinished',()=>{onReturn();listener.remove().catch(()=>{});});
 try{await browser.open({url:parsed.href,toolbarColor:'#081426'});}catch{await listener.remove();throw Error('The payment window could not open. Your bill is saved. Retry payment.');}
}
