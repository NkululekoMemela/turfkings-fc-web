const {onRequest}=require("firebase-functions/v2/https");
exports.poolNight=onRequest({region:"us-central1",cors:true,timeoutSeconds:60,maxInstances:10},async(req,res)=>{
 if(req.method!=="POST"){res.status(405).json({error:"Use POST."});return;}
 try{
  const bearer=String(req.headers.authorization||"").match(/^Bearer (.+)$/);
  if(!bearer){res.status(401).json({error:"Sign in to join the pool night."});return;}
  const admin=require("firebase-admin");
  if(!admin.apps.length)admin.initializeApp();
  const user=await admin.auth().verifyIdToken(bearer[1],true);
  const {getFirestore}=require("firebase-admin/firestore");
  const context={db:getFirestore(),user,body:req.body||{}};
  if(String(context.body.action).startsWith("billing")){res.json(await require("./poolBilling.cjs").handle(context));return;}
  res.json(["pushConfig","registerPush"].includes(context.body.action)?await require("./poolPush.cjs").register(context):await require("./poolNightService.cjs").handle(context));
 }catch(error){res.status(400).json({error:error.message||"Could not update this pool night."});}
});
