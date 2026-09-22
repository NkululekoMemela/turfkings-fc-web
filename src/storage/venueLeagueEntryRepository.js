import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "../firebaseConfig";

function requiredId(value, label) {
  const clean = String(value || "").trim();

  if (!clean) {
    throw new Error(`${label} is required.`);
  }

  if (clean.includes("/")) {
    throw new Error(`${label} cannot contain "/".`);
  }

  return clean;
}

function withoutUndefined(value) {
  if (Array.isArray(value)) {
    return value
      .map(withoutUndefined)
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [
          key,
          withoutUndefined(item),
        ])
    );
  }

  return value;
}

export function getVenueParticipantLogosCollection(
  firestore,
  venueId
) {
  return collection(
    firestore,
    "leagueVenues",
    requiredId(venueId, "Venue ID"),
    "participantLogos"
  );
}

async function loadVenueHighlightCollection({
  venueId,
  matchId,
  collectionName,
}) {
  const snapshot = await getDocs(
    collection(
      db,
      "leagueVenues",
      requiredId(venueId, "Venue ID"),
      "videoHighlights",
      requiredId(matchId, "Match ID"),
      collectionName
    )
  );

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

export function loadVenueRawHighlights(
  venueId,
  matchId
) {
  return loadVenueHighlightCollection({
    venueId,
    matchId,
    collectionName: "rawHighlights",
  });
}

export function loadVenueArchivedHighlights(
  venueId,
  matchId
) {
  return loadVenueHighlightCollection({
    venueId,
    matchId,
    collectionName: "archivedHighlights",
  });
}

export async function updateVenueLeagueProfile({
  venueId,
  venueDraft = {},
  logoDraft = {},
  bankingDraft = {},
}) {
  const user = auth.currentUser;

  if (!user?.uid) {
    throw new Error("Sign in as the field manager.");
  }

  const safeVenueId = requiredId(venueId, "Venue ID");
  const venueRef = doc(
    db,
    "leagueVenues",
    safeVenueId
  );
  const snapshot = await getDoc(venueRef);

  if (!snapshot.exists()) {
    throw new Error("Venue no longer exists.");
  }

  const existing = snapshot.data() || {};
  const authorizedUids = new Set([
    existing.ownerUid,
    ...(Array.isArray(existing.adminUids)
      ? existing.adminUids
      : []),
  ].filter(Boolean));

  if (!authorizedUids.has(user.uid)) {
    throw new Error(
      "Only this venue's field manager can update its profile."
    );
  }

  const patch = {
    ...withoutUndefined(venueDraft),
    branding: {
      ...(existing.branding || {}),
      ...withoutUndefined(logoDraft),
    },
    banking: {
      ...(existing.banking || {}),
      ...withoutUndefined(bankingDraft),
    },
    updatedAt: serverTimestamp(),
    updatedByUid: user.uid,
  };

  await setDoc(venueRef, patch, { merge: true });

  return {
    id: safeVenueId,
    ...existing,
    ...patch,
  };
}
