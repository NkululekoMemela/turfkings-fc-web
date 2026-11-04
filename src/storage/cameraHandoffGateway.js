import {
  auth,
  activeFirebaseProjectId,
} from "../firebaseConfig.js";

function safeString(value = "") {
  return String(value || "").trim();
}

function getFunctionsBaseUrl() {
  const explicit = safeString(
    import.meta.env.VITE_FUNCTIONS_BASE_URL
  );

  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const projectId =
    safeString(activeFirebaseProjectId);

  if (!projectId) {
    throw new Error(
      "[CameraHandoffGateway] Active Firebase project ID is unavailable."
    );
  }

  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function createCameraHandoff({
  clubId,
  matchId,
  fixtureContext = {},
  dataScope = "official",
} = {}) {
  const safeClubId = safeString(clubId);
  const safeMatchId = safeString(matchId);

  if (!safeClubId) {
    throw new Error(
      "[CameraHandoffGateway] clubId is required."
    );
  }

  if (!safeMatchId) {
    throw new Error(
      "[CameraHandoffGateway] matchId is required."
    );
  }

  if (safeString(dataScope).toLowerCase() !== "official") {
    const error = new Error(
      "Camera cannot be opened from Practice."
    );
    error.code = "camera/practice-forbidden";
    throw error;
  }

  const currentUser = auth?.currentUser;

  if (!currentUser) {
    const error = new Error(
      "Firebase sign-in is required before opening the camera."
    );
    error.code = "camera/auth-required";
    throw error;
  }

  const idToken = await currentUser.getIdToken(true);

  if (!idToken) {
    throw new Error(
      "[CameraHandoffGateway] Could not obtain Firebase ID token."
    );
  }

  const response = await fetch(
    `${getFunctionsBaseUrl()}/createCameraHandoff`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        clubId: safeClubId,
        matchId: safeMatchId,
        fixtureContext:
          fixtureContext &&
          typeof fixtureContext === "object"
            ? fixtureContext
            : {},
        dataScope: "official",
      }),
    }
  );

  const data = await readJsonResponse(response);

  if (!response.ok || !data?.ok || !data?.handoff) {
    const error = new Error(
      safeString(data?.error) ||
        "Could not authorize the camera."
    );

    error.code =
      safeString(data?.code) ||
      "camera/handoff-failed";

    error.status = response.status;

    throw error;
  }

  return data.handoff;
}

export function buildAuthorizedCameraDeepLink({
  handoffId,
} = {}) {
  const safeHandoffId = safeString(handoffId);

  if (!safeHandoffId) {
    throw new Error(
      "[CameraHandoffGateway] handoffId is required."
    );
  }

  return (
    "fiveasidesnearmecamera://open" +
    `?handoff=${encodeURIComponent(safeHandoffId)}`
  );
}
