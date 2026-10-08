import {
  auth, getActiveFirebaseFunctionsBaseUrl,
} from "../firebaseConfig.js";

export async function fieldTeamPaymentRequest(
  venueId, action, details = {}, signal,
) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sign in with Google to use Field payments.");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, {once: true});
  const timeout = window.setTimeout(abort, 20000);

  try {
    const token = await user.getIdToken();
    const configured = getActiveFirebaseFunctionsBaseUrl();
    const base = configured.endsWith("/")
      ? configured.slice(0, -1) : configured;
    const response = await fetch(`${base}/fieldTeamPayments`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({...details, venueId, action}),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Could not update Field payments.");
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError" && !signal?.aborted) {
      throw new Error(
        "The payment service is taking longer than usual. Refresh before retrying."
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
