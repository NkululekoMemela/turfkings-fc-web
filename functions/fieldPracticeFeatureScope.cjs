async function resolveFeatureScope({db,user,body,venueId}) {
 const scope=body.scope;
 if(scope && (scope.kind!=="venueLeague"||scope.venueId!==venueId||!["official","practice"].includes(scope.environment)))throw Error("Invalid feature scope.");
 if(!scope||scope.environment==='official')return {practice:false,root:`leagueVenues/${venueId}`};
 if(scope.kind!=='venueLeague'||scope.environment!=='practice'||scope.venueId!==venueId||! /^[A-Za-z0-9_-]{1,150}$/.test(scope.practiceSessionId||''))throw Error('Invalid Practice scope.');
 const snap=await db.doc(`practiceSessions/${scope.practiceSessionId}`).get(),session=snap.data();
 if(!session||session.kind!=='venueLeague'||session.environment!=='practice'||session.venueId!==venueId||session.sessionId!==scope.practiceSessionId||session.userId!==user.uid||session.status!=='active'||!session.expiresAt?.toMillis||session.expiresAt.toMillis()<=Date.now())throw Error('This Practice session is unavailable or expired.');
 return {practice:true,root:`sandboxes/practice/leagueVenues/${venueId}/sessions/${scope.practiceSessionId}`};
}
module.exports={resolveFeatureScope};
