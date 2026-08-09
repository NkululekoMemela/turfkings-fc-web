// src/core/gpi/identityResolver.js
//
// Global Player Identity (GPI)
// Stage 1: identity discovery.
//
// IMPORTANT:
// For this first checkpoint we intentionally delegate the actual
// Firestore lookup to the existing proven platform identity repository.
// EntryPage is NOT switched to this module yet.

import {
  findCandidatePlatformIdentity,
} from "../../storage/platformIdentityRepository.js";

import {
  rankReusableProfiles,
  selectBestReusableProfile,
} from "./profileRankingEngine.js";

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function splitFullName(value = "") {
  const parts = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  return {
    firstName: parts[0] || "",
    surname: parts.slice(1).join(" "),
  };
}

/**
 * Resolve cross-club GPI candidates using the current proven repository.
 *
 * This function performs READS ONLY.
 *
 * At this checkpoint it intentionally preserves the existing repository's
 * first-name + surname + email requirements so there is no behavioural
 * change to signup/sign-in.
 */
export async function resolvePlayerIdentity({
  email = "",
  fullName = "",
  firstName = "",
  surname = "",
  excludeClubId = "",
} = {}) {
  const normalizedEmail = normalizeEmail(email);

  const parsedName = splitFullName(fullName);

  const resolvedFirstName =
    String(firstName || parsedName.firstName || "").trim();

  const resolvedSurname =
    String(surname || parsedName.surname || "").trim();

  if (
    !normalizedEmail ||
    !resolvedFirstName ||
    !resolvedSurname
  ) {
    return {
      verifiedEmail: normalizedEmail,
      candidates: [],
      bestProfile: null,
      matchCount: 0,
      source: "existing-platform-identity-repository",
    };
  }

  const candidates = await findCandidatePlatformIdentity({
    firstName: resolvedFirstName,
    surname: resolvedSurname,
    email: normalizedEmail,
  });

  const rankedCandidates = rankReusableProfiles(candidates);

  const bestProfile = selectBestReusableProfile(
    rankedCandidates,
    {
      excludeClubId,
    }
  );

  return {
    verifiedEmail: normalizedEmail,
    candidates: rankedCandidates,
    bestProfile,
    matchCount: rankedCandidates.length,
    source: "existing-platform-identity-repository",
  };
}
