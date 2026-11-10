import {auth, getActiveFirebaseFunctionsBaseUrl, isStagingFirebase} from "../firebaseConfig";

export const clubChallengesEnabled =
  isStagingFirebase
    ? import.meta.env.VITE_FANM_CLUB_CHALLENGES !== "false"
    : import.meta.env.VITE_FANM_CLUB_CHALLENGES_PRODUCTION === "true";

export async function clubChallengeRequest(action, data, signal) {
  if (!clubChallengesEnabled) throw new Error("Club challenges are unavailable in this build.");
  const user = auth.currentUser;
  if (action !== "watch" && !user?.emailVerified) throw new Error("Sign in with your verified Club account.");
  const response = await fetch(`${getActiveFirebaseFunctionsBaseUrl()}/clubChallengeMatch`, {
    method: "POST",
    headers: {"Content-Type": "application/json", ...(action === "watch" ? {} : {Authorization: `Bearer ${await user.getIdToken()}`})},
    body: JSON.stringify({action, data}),
    signal,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(result.error || "The challenge service is unavailable."), {status: response.status});
  }
  return result;
}
