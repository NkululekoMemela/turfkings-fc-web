// Launch catalogue uses made-to-order sales rather than fictional warehouse stock.
// Delivery is included in this proposed launch profile; captains supply the address.
const colours=[['blue','Royal blue','#2563eb'],['green','Lime green','#94d82d'],['gold','Gold','#c4a46b'],['orange','Orange','#fb923c']];
function launchProfile(){return {
 settings:{enabled:true,currency:'ZAR',countryCode:'ZA',collectionEnabled:false,collectionAddress:'',deliveryEnabled:true,zones:[{id:'za-captain',label:'South Africa · delivery to captain included',feeMinor:0}],paymentInstructions:'Pay FANM securely through Yoco. Your pack is prepared after payment and delivered to your captain.',paymentMethod:'yoco',bulkOnly:true,launchProfileVersion:1},
 products:colours.map(([key,name,color])=>({id:`fanm-bib-${key}`,title:`${name} numbered bib`,description:'Made to order · number printing included. Captain distributes the pack.',kind:'bib',color,size:'Adult training bib',priceMinor:9500,stock:0,madeToOrder:true,active:true,currency:'ZAR'}))
};}
async function activateLaunchShop({db,user,isOperator}){
 if(!isOperator)throw Error('Shop operator access is required.');
 const profile=launchProfile();
 return db.runTransaction(async tx=>{
  const configRef=db.doc('kitShopConfig/store'),config=(await tx.get(configRef)).data();
  if(config?.launchProfileVersion===1)return {ok:true,unchanged:true};
  const refs=profile.products.map(p=>db.doc('kitShopProducts/'+p.id)),old=await tx.getAll(...refs);
  old.forEach((snap,i)=>{if(!snap.exists){const {id,...product}=profile.products[i];tx.set(refs[i],{...product,revision:1,updatedAtMs:Date.now(),updatedByUid:user.uid});}});
  tx.set(configRef,{...config,...profile.settings,revision:(config?.revision||0)+1,updatedAtMs:Date.now(),updatedByUid:user.uid});
  return {ok:true};
 });
}
module.exports={launchProfile,activateLaunchShop};
