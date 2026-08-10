// src/storage/practiceSessionGateway.js
//
// Client gateway for Practice v2 server-controlled operations.
//
// SECURITY:
// - Firebase ID token establishes caller identity.
// - Client sends only the requested clubId.
// - UID/email/role/week/credits/session timestamps are server-owned.
// - No Practice UI is wired to this module yet.

import { auth } from "../firebaseConfig.js";

const FUNCTIONS_REGION = "us-central1";

function safeString(value = "") {
  return String(value || "").trim();
}

function getFunctionsBaseUrl() {
  const viteEnv =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env
      : {};

  const explicit = safeString(
    viteEnv.VITE_FUNCTIONS_BASE_URL
  );

  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const projectId = safeString(
    viteEnv.VITE_FIREBASE_PROJECT_ID
  );

  if (!projectId) {
    throw new Error(
      "[PracticeSessionGateway] Missing VITE_FIREBASE_PROJECT_ID."
    );
  }

  if (
    typeof window !== "undefined" &&
    (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    )
  ) {
    return (
      `http://127.0.0.1:5001/` +
      `${projectId}/${FUNCTIONS_REGION}`
    );
  }

  return (
    `https://${FUNCTIONS_REGION}-` +
    `${projectId}.cloudfunctions.net`
  );
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function startPracticeSession({
  clubId,
} = {}) {
  const safeClubId = safeString(clubId);

  if (!safeClubId) {
    throw new Error(
      "[PracticeSessionGateway] clubId is required."
    );
  }

  const currentUser = auth?.currentUser;

  if (!currentUser) {
    throw new Error(
      "[PracticeSessionGateway] Firebase sign-in is required."
    );
  }

  /*
   * Force-refresh gives the server a current authentication token.
   * The server independently derives UID/email from this token.
   */
  const idToken = await currentUser.getIdToken(true);

  if (!idToken) {
    throw new Error(
      "[PracticeSessionGateway] Could not obtain Firebase ID token."
    );
  }

  const url =
    `${getFunctionsBaseUrl()}/startPracticeSession`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      clubId: safeClubId,
    }),
  });

  const data = await readJsonResponse(response);

  if (!response.ok || !data?.ok || !data?.session) {
    const error = new Error(
      safeString(data?.error) ||
      "Could not start Practice session."
    );

    error.code =
      safeString(data?.code) ||
      "practice/start-failed";

    error.status = response.status;

    throw error;
  }

  const session = data.session;

  if (
    !safeString(session.sessionId) ||
    !safeString(session.startedAt) ||
    !safeString(session.expiresAt)
  ) {
    throw new Error(
      "[PracticeSessionGateway] Server returned an invalid Practice session."
    );
  }

  return session;
}
