const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret,defineBoolean}=require('firebase-functions/params');
const token=defineSecret('FACEBOOK_PAGE_ACCESS_TOKEN');
const enabled=defineBoolean('FACEBOOK_PUBLISH_ENABLED',{default:false});
exports.facebookReview=onRequest({region:'us-central1',cors:true,invoker:'public',secrets:[token],timeoutSeconds:360},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const bearer=String(req.headers.authorization||'').match(/^Bearer (.+)$/);if(!bearer)return res.status(401).json({error:'Sign in first.'});
  const {getApps,initializeApp}=require('firebase-admin/app'),app=getApps()[0]||initializeApp();
  const user=await require('firebase-admin/auth').getAuth(app).verifyIdToken(bearer[1],true),db=require('firebase-admin/firestore').getFirestore(app);
  const production=process.env.GCLOUD_PROJECT==='five-asides-near-me';
  res.json(await require('./facebookReview.cjs').handle({db,user,body:req.body||{},token:token.value(),liveEnabled:production&&enabled.value()}));
 }catch(e){res.status(400).json({error:e.message||'Facebook review failed.'});}
});
