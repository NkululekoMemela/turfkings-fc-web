import {auth, getActiveFirebaseFunctionsBaseUrl} from "../firebaseConfig.js";

export async function fieldLogoStudioRequest(body, signal) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to create your Field.");
  const token = await user.getIdToken();
  const base = getActiveFirebaseFunctionsBaseUrl({allowExplicit: false}).replace(/\/$/, "");
  const response = await fetch(`${base}/fieldLogoStudio`, {
    method: "POST", signal,
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${token}`},
    body: JSON.stringify(body),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error("The Field logo service is not available yet. Please try again later."); }
  if (!response.ok || !result.ok) throw new Error(result.error || "Could not save your Field.");
  return result;
}
