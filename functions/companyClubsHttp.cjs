const {onRequest}=require('firebase-functions/v2/https');
exports.companyClubs=onRequest({region:'us-central1',cors:true,invoker:'public'},async(req,res)=>{
 res.set('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const bearer=String(req.headers.authorization||'').match(/^Bearer (.+)$/);if(!bearer)return res.status(401).json({error:'Sign in first.'});
  const {getApps,initializeApp}=require('firebase-admin/app'),app=getApps()[0]||initializeApp();
  const user=await require('firebase-admin/auth').getAuth(app).verifyIdToken(bearer[1],true),db=require('firebase-admin/firestore').getFirestore(app);
  const uploadLogo=async({bytes,uid})=>{const {randomUUID}=require('node:crypto'),token=randomUUID(),bucket=require('firebase-admin/storage').getStorage(app).bucket(),file=bucket.file(`companyApplications/${uid}/${token}.png`);await file.save(bytes,{resumable:false,metadata:{contentType:'image/png',cacheControl:'public,max-age=31536000,immutable',metadata:{firebaseStorageDownloadTokens:token}}});return {url:`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`,remove:()=>file.delete().catch(()=>{})};};
  res.json(await require('./companyClubs.cjs').handle({db,user,body:req.body||{},uploadLogo}));
 }catch(error){res.status(403).json({error:error.message||'Could not update Company Clubs.'});}
});
