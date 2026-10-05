import {
  auth, getActiveFirebaseFunctionsBaseUrl,
} from "../firebaseConfig.js";

async function requestSeasonSquad(endpoint, details) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to access your league squad.");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25000);
  try {
    const token = await user.getIdToken();
    const baseUrl = getActiveFirebaseFunctionsBaseUrl();
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const response = await fetch(`${base}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(details),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || "Could not update the league squad.");
    }
    if (!result || typeof result !== "object") {
      throw new Error("The league service returned an invalid response.");
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "The league service took too long. Refresh before trying again."
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const getSeasonSquadView = details =>
  requestSeasonSquad("getFieldSeasonSquad", details);

export const createSeasonSquad = details =>
  requestSeasonSquad("createFieldSeasonSquad", details);

export const respondSeasonInvitation = details =>
  requestSeasonSquad("respondFieldSeasonSquad", details);

export const confirmSeasonPayment = details =>
  requestSeasonSquad("confirmFieldSeasonSquadPayment", details);

export const setSeasonAvailability = details =>
  requestSeasonSquad("setFieldSeasonMatchDayAvailability", details);

export const createSeasonCheckout = details =>
  requestSeasonSquad("createYocoCheckout", {
    ...details, purpose: "field_season",
  });

export const getClubMatchDaySquad = details =>
  requestSeasonSquad("getClubFieldMatchDaySquad", details);
export const submitClubMatchDaySquad = details =>
  requestSeasonSquad("submitClubFieldMatchDaySquad", details);
export const getFieldMatchDaySquads = details =>
  requestSeasonSquad("getFieldMatchDaySquads", details);
export const confirmMatchDayCover = details =>
  requestSeasonSquad("inviteFieldMatchDayReplacement", {
    ...details, captainConfirmed: true,
  });
export const cancelMatchDayCover = details =>
  requestSeasonSquad("cancelFieldMatchDayReplacement", details);
