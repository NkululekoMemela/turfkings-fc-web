const {onDocumentWritten}=require('firebase-functions/v2/firestore');
function trigger(document){return onDocumentWritten({document,region:'us-central1',retry:true},async event=>{
 if(!event.data?.after.exists)return;
 const {getApps,initializeApp}=require('firebase-admin/app'),app=getApps()[0]||initializeApp();
 await require('./facebookReview.cjs').capture({db:require('firebase-admin/firestore').getFirestore(app),path:event.data.after.ref.path,h:event.data.after.data()});
});}
exports.queueClubFacebookHighlight=trigger('clubs/{clubId}/video_highlights/{matchId}/archived/{clipId}');
exports.queueFieldFacebookHighlight=trigger('leagueVenues/{venueId}/video_highlights/{matchId}/archived/{clipId}');

exports.onFacebookHighlightReady=require('./facebookHighlightNotifications.cjs').buildHandler();
