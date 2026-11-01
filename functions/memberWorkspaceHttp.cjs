const {onRequest}=require("firebase-functions/v2/https");
function endpoint(service){return onRequest({region:"us-central1",cors:true},async(req,res)=>{
 res.set("Cache-Control","no-store");if(req.method!=="POST"){res.status(405).json({error:"Use POST."});return;}
 try{
  const bearer=String(req.headers.authorization||"").match(/^Bearer (.+)$/);if(!bearer)throw Error("Sign in first.");
  const {getApps,initializeApp}=require("firebase-admin/app");if(!getApps().length)initializeApp();
  const user=await require("firebase-admin/auth").getAuth().verifyIdToken(bearer[1],true);
  res.json(await require(service).handle({db:require("firebase-admin/firestore").getFirestore(),user,body:req.body||{}}));
 }catch(error){res.status(403).json({error:error.message||"Request failed."});}
});}
exports.clubTeamChat=endpoint("./clubTeamChat.cjs");
exports.manageFieldStaff=endpoint("./fieldStaffManagement.cjs");

exports.fieldClubChat=endpoint("./fieldClubChat.cjs");
