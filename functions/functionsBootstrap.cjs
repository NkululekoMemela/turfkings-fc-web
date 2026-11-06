// Keep discovery complete; isolate frequently used HTTP targets on cold start.
const targets={facebookReview:"./facebookReviewHttp.cjs",kitShop:"./kitShopHttp.cjs",companyClubs:"./companyClubsHttp.cjs"};
const loaded=require(targets[process.env.FUNCTION_TARGET]||"./index.js");
// Opt-in deploy discovery only. Normal runtime and full deployments remain unchanged.
const selected=String(process.env.FANM_DEPLOY_EXPORTS||"").split(",").filter(Boolean);
if(selected.length&&!process.env.FUNCTION_TARGET){
  for(const name of selected)if(!Object.hasOwn(loaded,name))throw Error(`Unknown deployment export: ${name}`);
  module.exports=Object.fromEntries(selected.map(name=>[name,loaded[name]]));
}else module.exports=loaded;
