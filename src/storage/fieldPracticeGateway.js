import {
  auth, getActiveFirebaseFunctionsBaseUrl,
} from "../firebaseConfig.js";

export async function fieldPracticeRequest(operation, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in as a Field official to use Practice.");
  const token = await user.getIdToken();
  const base = getActiveFirebaseFunctionsBaseUrl({allowExplicit: false});
  const response = await fetch(`${base.replace(/\/$/, "")}/${operation}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    throw new Error(result.error || "Field Practice could not continue.");
  }
  return result;
}
