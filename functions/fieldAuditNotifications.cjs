const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {FieldValue}=require('firebase-admin/firestore');
function buildHandler({db,region,sendBatch}){
 return onDocumentCreated({document:'leagueVenues/{venueId}/actionLog/{actionId}',region,retry:true},async event=>{
  const action=event.data?.data();if(!action)return;
  if(!['staff_permissions_changed','match_reversed','match_corrected','fixture_pairing_selected','season_started','season_ended','season_cancelled'].includes(action.action)&&!(action.action==='match_started'&&String(action.details).includes('OUTSIDE SCHEDULE:')))return;
  const venueId=event.params.venueId,venue=(await db.doc(`leagueVenues/${venueId}`).get()).data();if(!venue||venue.deleted)return;
  const staff=await db.collection(`leagueVenues/${venueId}/staff`).get(),uids=new Set([venue.ownerUid].filter(Boolean));for(const d of staff.docs)if(d.data().status==='active'&&d.data().isAdministrator===true)uids.add(d.id);
  const delivery=db.doc(`notificationDeliveries/field-audit-${event.params.actionId}`);if((await delivery.get()).data()?.sent)return;
  const records=await require('./notificationRuntime.cjs').registeredTokens(db,[...uids]);if(!records.length)return;
  const result=await sendBatch({tokenRecords:records,title:`${venue.name||'Field'} · ${action.label}`,body:`${action.actorName}: ${action.details}`.slice(0,180),imageUrl:'',data:{type:'field_audit',route:'field',venueId,seasonId:action.seasonId||'',sourceName:venue.name||'Field',actionId:event.params.actionId}});if(!result.successCount)throw Error('Could not deliver Field audit notification.');await delivery.set({sent:true,at:FieldValue.serverTimestamp()});
 });
}
module.exports={buildHandler};
