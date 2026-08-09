// ============================================================
// Platform Player Service
// GPI Stage 2.2
//
// Pure business logic only.
// No Firebase imports.
// No Firestore reads/writes.
// No React dependencies.
// ============================================================

import {
  buildPlatformPlayer,
  mergePlatformPlayer,
  isPlatformPlayerComplete,
} from "./platformPlayerRepository.js";

function clean(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return clean(value).toLowerCase();
}

export function buildPlatformPlayerSnapshot({
  authenticatedUser = null,
  reusableProfile = null,
  currentMember = null,
} = {}) {
  const authEmail = normalizeEmail(authenticatedUser?.email);

  const source = reusableProfile || currentMember || {};

  return buildPlatformPlayer({
    uid:
      clean(authenticatedUser?.uid) ||
      clean(source.uid) ||
      clean(source.platformIdentityUid),

    email:
      authEmail ||
      normalizeEmail(source.email),

    fullName:
      clean(source.fullName) ||
      clean(source.name) ||
      clean(authenticatedUser?.displayName),

    photoUrl:
      clean(source.photoData) ||
      clean(source.photoUrl) ||
      clean(source.profilePhotoUrl) ||
      clean(source.avatarUrl),

    whatsappNumber:
      clean(source.whatsappNumber) ||
      clean(source.phoneNumber),
  });
}

export function shouldCreatePlatformPlayer(player = {}) {
  return Boolean(
    clean(player.uid) &&
    normalizeEmail(player.email)
  );
}

export function shouldLinkMembershipToPlatformPlayer({
  platformPlayer = null,
  member = null,
} = {}) {
  if (!platformPlayer || !member) return false;

  const platformEmail = normalizeEmail(platformPlayer.email);
  const memberEmail = normalizeEmail(member.email);

  if (!platformEmail || !memberEmail) return false;

  return platformEmail === memberEmail;
}

export function mergePlatformIdentity({
  existingPlatformPlayer = {},
  incomingSnapshot = {},
} = {}) {
  return mergePlatformPlayer(
    existingPlatformPlayer,
    incomingSnapshot
  );
}

export function evaluatePlatformPlayerState(player = {}) {
  return {
    hasIdentityKey: Boolean(clean(player.uid)),
    hasEmail: Boolean(normalizeEmail(player.email)),
    complete: isPlatformPlayerComplete(player),
  };
}
