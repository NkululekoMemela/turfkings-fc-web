// src/core/gpi/identityResolver.js
//
// Global Player Identity (GPI)
// Stage 1 — cross-club identity discovery.
//
// GPI identity rule:
// authenticated/claimed email is the primary platform identity key.
// Names are descriptive metadata, not identity proof.

import {
  rankReusableProfiles,
  selectBestReusableProfile,
} from "./profileRankingEngine.js";

export function normalizeGpiEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

/**
 * Pure helper used both by production code and automated tests.
 */
export function resolvePlayerIdentityFromCandidates({
  email = "",
  candidates = [],
  excludeClubId = "",
} = {}) {
  const normalizedEmail = normalizeGpiEmail(email);

  if (!normalizedEmail) {
    return {
      verifiedEmail: "",
      candidates: [],
      bestProfile: null,
      matchCount: 0,
      source: "gpi-email-resolver",
    };
  }

  const emailMatches = (Array.isArray(candidates) ? candidates : [])
    .filter(
      (candidate) =>
        normalizeGpiEmail(candidate?.email) === normalizedEmail
    );

  const rankedCandidates = rankReusableProfiles(emailMatches);

  const bestProfile = selectBestReusableProfile(
    rankedCandidates,
    { excludeClubId }
  );

  return {
    verifiedEmail: normalizedEmail,
    candidates: rankedCandidates,
    bestProfile,
    matchCount: rankedCandidates.length,
    source: "gpi-email-resolver",
  };
}

/**
 * Firestore-backed resolver.
 *
 * READ ONLY.
 */
export async function resolvePlayerIdentity({
  email = "",
  excludeClubId = "",
} = {}) {
  const normalizedEmail = normalizeGpiEmail(email);

  if (!normalizedEmail) {
    return resolvePlayerIdentityFromCandidates({
      email: "",
      candidates: [],
      excludeClubId,
    });
  }

  /*
   * Load the Firebase-backed repository only when the live resolver
   * actually needs Firestore.
   *
   * This keeps the pure GPI identity/ranking functions independently
   * unit-testable in Node without loading Firebase/Vite infrastructure.
   */
  const {
    findPlatformIdentitiesByEmail,
  } = await import(
    "../../storage/platformIdentityRepository.js"
  );

  const candidates =
    await findPlatformIdentitiesByEmail(normalizedEmail);

  const resolution = resolvePlayerIdentityFromCandidates({
    email: normalizedEmail,
    candidates,
    excludeClubId,
  });

  console.log("[GPI Resolver]", {
    email: normalizedEmail,
    excludeClubId,
    matchCount: resolution.matchCount,
    selectedClubId: resolution.bestProfile?.clubId || "",
    selectedMemberId: resolution.bestProfile?.memberId || "",
    selectedCompleteness:
      resolution.bestProfile?.gpiCompleteness?.score ?? null,
  });

  return resolution;
}
