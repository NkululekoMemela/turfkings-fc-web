// Keep discovery complete; isolate frequently used HTTP targets on cold start.
const targets={facebookReview:"./facebookReviewHttp.cjs",kitShop:"./kitShopHttp.cjs",companyClubs:"./companyClubsHttp.cjs",announceFieldPracticeSeason:"./fieldPracticeAnnouncementHttp.cjs"};
const target=process.env.FUNCTION_TARGET;
function fieldLiveScore(){
  const {getApps,initializeApp}=require("firebase-admin/app");
  if(!getApps().length)initializeApp();
  return {onFieldLiveScore:require("./fieldLiveScore.cjs").buildHandler({
    db:require("firebase-admin/firestore").getFirestore(),
    messaging:require("firebase-admin/messaging").getMessaging(),
  })};
}
const loaded=target==="onFieldLiveScore" ? fieldLiveScore() : target==="fieldRefereeBooth"
  ? {fieldRefereeBooth:require("./fieldBooth.cjs").fieldRefereeBooth}
  : require(targets[target]||"./index.js");
// Opt-in deploy discovery only. Normal runtime and full deployments remain unchanged.
const selected=String(process.env.FANM_DEPLOY_EXPORTS||"").split(",").filter(Boolean);
if(selected.length&&!process.env.FUNCTION_TARGET){
  for(const name of selected)if(!Object.hasOwn(loaded,name))throw Error(`Unknown deployment export: ${name}`);
  module.exports=Object.fromEntries(selected.map(name=>[name,loaded[name]]));
}else module.exports=loaded;
