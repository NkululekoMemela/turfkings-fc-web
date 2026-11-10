"use strict";
const {onDocumentCreated}=require("firebase-functions/v2/firestore");

function buildHandler({db,region,auth,messaging,testOnly=false,runtime: suppliedRuntime}) {
  const created=testOnly?(_config,fn)=>fn:onDocumentCreated;
  return created({document:"leagueVenues/{venueId}/seasons/{seasonId}",region,retry:true,timeoutSeconds:180},async event=>{
    const season=event.data?.data();
    if(!season||season.status!=="completed"||!season.endedByUid||!season.endedAtMs||
      season.isPracticeSeason||season.isPracticeMode)return;
    const venueId=event.params.venueId;
    const venue=(await db.doc(`leagueVenues/${venueId}`).get()).data();
    if(!venue||venue.deleted)return;
    const {fieldSeasonCelebration}=await import("./fieldSeasonClosure.mjs");
    const summary=fieldSeasonCelebration({season,venueName:venue.name,endedAtMs:season.endedAtMs});
    const runtime=suppliedRuntime||require("./notificationRuntime.cjs");
    const ids=new Set(await runtime.allFieldAudience(db,venueId,venue,auth));
    for(const clubId of season.clubIds||[])for(const uid of await runtime.clubAudience(db,clubId,auth))ids.add(uid);
    const title=summary.winner?`🏆 ${summary.winner.name} are champions!`:`${venue.name||"Field"} · Season finished`;
    const body=summary.winner?`${summary.seasonName}: ${summary.winner.points} points. Celebrate the champions and every Club that took part.`:
      summary.premature?"The tournament ended early. View the final recorded standings and thank the teams.":
      "Celebrate every Club, player and official. View the final season standings.";
    await runtime.reliableBatch({db,messaging,tokenRecords:await runtime.registeredTokens(db,[...ids]),
      title,body,imageUrl:await runtime.groupImage(venue),
      data:{type:"field_season_celebration",route:"field",venueId,seasonId:season.id,
        messageId:`season-finale-${season.id}`,sourceName:String(venue.name||"Field")}});
  });
}
module.exports={buildHandler};
