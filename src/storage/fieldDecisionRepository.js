import {venueLeagueRootPath} from "../core/venueLeaguePaths.js";
import {submitPracticeDecision, reviewPracticeDecision} from "./fieldPracticeDecisionRepository.js";
import {collection, onSnapshot, query, where} from "firebase/firestore";
import {auth, db, getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";

async function callDecision(name, body) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in before requesting a Field decision.");
  const token = await user.getIdToken();
  const baseUrl = getActiveFirebaseFunctionsBaseUrl();
  const response = await fetch(
    `${baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl}/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "The Field decision could not be saved.");
  }
  return result;
}

export function submitFieldDecision({
  scope = null, venueId, seasonId, action, reason, parameters,
  requestId = crypto.randomUUID(),
}) {
  if (scope?.environment === "practice") return submitPracticeDecision({
    scope, venueId, seasonId, action, reason, parameters, requestId,
  });
  if (scope) {
    venueLeagueRootPath(scope);
    if (scope.venueId !== venueId) throw new Error("Decision scope mismatch.");
  }
  return callDecision("submitFieldDecision", {
    venueId, seasonId, action, reason, parameters, requestId,
  });
}

export function reviewFieldDecision({scope = null, venueId, requestId, response}) {
  if (scope?.environment === "practice") return reviewPracticeDecision({
    scope, venueId, requestId, response,
  });
  if (scope) {
    venueLeagueRootPath(scope);
    if (scope.venueId !== venueId) throw new Error("Decision scope mismatch.");
  }
  return callDecision("reviewFieldDecision", {venueId, requestId, response});
}

export function watchFieldDecisions({
  scope = null, venueId, isCreator = false, onData, onError,
}) {
  const uid = auth.currentUser?.uid;
  if (!venueId || !uid) {
    onData([]);
    return () => {};
  }
  if (scope && scope.venueId !== venueId) throw new Error("Decision scope mismatch.");
  const root = scope ? venueLeagueRootPath(scope) : `leagueVenues/${venueId}`;
  const requests = collection(db, `${root}/decisionRequests`);
  const source = isCreator ? requests :
    query(requests, where("requestedByUid", "==", uid));
  return onSnapshot(source, snapshot => {
    onData(snapshot.docs.map(item => ({...item.data(), id: item.id}))
      .sort((a, b) => Number(b.requestedAtMs) - Number(a.requestedAtMs)));
  }, onError);
}
