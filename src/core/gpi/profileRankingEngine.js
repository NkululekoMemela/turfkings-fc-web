// src/core/gpi/profileRankingEngine.js
//
// Global Player Identity (GPI)
// Stage 1: profile ranking.
//
// IMPORTANT:
// This module is deliberately pure.
// It performs no Firebase reads/writes and has no React dependencies.

function clean(value) {
  return String(value || "").trim();
}

export function getReusableProfileFields(profile = {}) {
  return {
    fullName: clean(profile.fullName),
    shortName: clean(profile.shortName),
    email: clean(profile.email).toLowerCase(),
    whatsappNumber: clean(
      profile.whatsappNumber || profile.phoneNumber
    ),
    phoneNumber: clean(
      profile.phoneNumber || profile.whatsappNumber
    ),
    photoData: clean(profile.photoData),
    photoUrl: clean(
      profile.photoUrl ||
      profile.profilePhotoUrl ||
      profile.avatarUrl
    ),
    uid: clean(
      profile.uid ||
      profile.platformIdentityUid
    ),
  };
}

export function calculateProfileCompleteness(profile = {}) {
  const fields = getReusableProfileFields(profile);

  const hasPhoto = Boolean(fields.photoData || fields.photoUrl);
  const hasPhone = Boolean(
    fields.whatsappNumber || fields.phoneNumber
  );

  const checks = {
    fullName: Boolean(fields.fullName),
    email: Boolean(fields.email),
    photo: hasPhoto,
    phone: hasPhone,
    uid: Boolean(fields.uid),
  };

  const score = Object.values(checks).filter(Boolean).length;

  return {
    score,
    maxScore: Object.keys(checks).length,
    checks,
    complete: score === Object.keys(checks).length,
  };
}

export function rankReusableProfiles(profiles = []) {
  return [...(Array.isArray(profiles) ? profiles : [])]
    .map((profile) => ({
      ...profile,
      gpiCompleteness: calculateProfileCompleteness(profile),
    }))
    .sort((a, b) => {
      const scoreDifference =
        b.gpiCompleteness.score -
        a.gpiCompleteness.score;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      // Stable deterministic fallback.
      return String(a.clubName || a.clubId || "").localeCompare(
        String(b.clubName || b.clubId || "")
      );
    });
}

export function selectBestReusableProfile(
  profiles = [],
  {
    excludeClubId = "",
  } = {}
) {
  const cleanExcludedClubId = clean(excludeClubId);

  const eligible = (Array.isArray(profiles) ? profiles : []).filter(
    (profile) =>
      !cleanExcludedClubId ||
      clean(profile?.clubId) !== cleanExcludedClubId
  );

  return rankReusableProfiles(eligible)[0] || null;
}
