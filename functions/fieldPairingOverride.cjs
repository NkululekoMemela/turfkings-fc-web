const {onRequest}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
exports.handler=async(req,res,deps={})=>{
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/);
  if(!token)return res.status(401).json({error:'Sign in first.'});
  const user=await(deps.verifyToken||((t)=>admin.auth().verifyIdToken(t,true)))(token[1]);
  const {venueId,seasonId,clubAId,clubBId,confirmed}=req.body||{};
  if(confirmed!==true||![venueId,seasonId,clubAId,clubBId].every(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(id)))throw Error('Confirm the two Clubs before changing the pairing.');
  const db=deps.db||getFirestore(),ref=db.doc(`leagueVenues/${venueId}`);
  const result=await db.runTransaction(async tx=>{
   const [venueSnap,staffSnap,liveSnap]=await tx.getAll(ref,ref.collection('staff').doc(user.uid),ref.collection('seasons').doc(seasonId).collection('matches').doc('current'));
   const venue=venueSnap.data(),staff=staffSnap.data();
   if(!venue||!(venue.ownerUid===user.uid||(staff?.status==='active'&&['field_manager','assistant_manager','field_assistant','other_staff','referee'].includes(staff.role))))throw Error('Only an approved Field official can change the pairing.');
   const season=venue.league?.activeSeason;
   if(season?.id!==seasonId)throw Error('The active season changed.');
   if(liveSnap.data()?.status==='live')throw Error('Finish the live match first.');
   const {planFieldPairing}=await import('./fieldPairingPlan.mjs');
   const plan=planFieldPairing({season,clubAId,clubBId,actorUid:user.uid});
   tx.update(ref,{'league.activeSeason.fixtures':plan.fixtures,'league.activeSeason.selectedFixtureId':plan.fixture.id,'league.activeSeason.selectedFixtureIndex':plan.fixtureIndex,'league.activeSeason.selectedMatchDayIndex':plan.matchDayIndex,updatedAt:FieldValue.serverTimestamp()});
   tx.set(ref.collection('seasons').doc(seasonId).collection('pairingChanges').doc(),{actorUid:user.uid,fixtureId:plan.fixture.id,changes:plan.changes,createdAt:FieldValue.serverTimestamp()});
   return plan.fixture.id;
  });
  return res.json({fixtureId:result});
 }catch(error){return res.status(400).json({error:error.message||'Could not change pairing.'});}
};
exports.chooseFieldMatchPairing=onRequest({region:'us-central1',invoker:'public',cors:true},(req,res)=>exports.handler(req,res));
