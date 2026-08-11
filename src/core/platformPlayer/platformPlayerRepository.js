// ============================================================
// Platform Player Repository
// Stage 2.1
//
// PURPOSE
// -------
// This module is the ONLY place responsible for reading and
// writing Platform Player identities.
//
// IMPORTANT
// ---------
// - No existing member documents are modified.
// - No signup flow changes.
// - No sign-in flow changes.
// - No Firestore writes occur unless a caller explicitly
//   requests them.
//
// This checkpoint is architecture only.
// ============================================================

function clean(value) {
  return String(value || "").trim();
}

export function buildPlatformPlayer({
  uid = "",
  email = "",
  fullName = "",
  photoUrl = "",
  whatsappNumber = "",
} = {}) {
  return {
    uid: clean(uid),
    email: clean(email).toLowerCase(),
    fullName: clean(fullName),
    photoUrl: clean(photoUrl),
    whatsappNumber: clean(whatsappNumber),
  };
}

export function isPlatformPlayerComplete(player = {}) {
  return Boolean(
    clean(player.uid) &&
    clean(player.email) &&
    clean(player.fullName)
  );
}

export function mergePlatformPlayer(existing = {}, incoming = {}) {
  return {
    uid:
      clean(existing.uid) ||
      clean(incoming.uid),

    email:
      clean(existing.email) ||
      clean(incoming.email),

    fullName:
      clean(existing.fullName) ||
      clean(incoming.fullName),

    photoUrl:
      clean(existing.photoUrl) ||
      clean(incoming.photoUrl),

    whatsappNumber:
      clean(existing.whatsappNumber) ||
      clean(incoming.whatsappNumber),
  };
}
