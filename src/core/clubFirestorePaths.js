// src/core/clubFirestorePaths.js

import { collection, doc } from "firebase/firestore";

import {
  clubCollectionPath,
  clubDocPath,
  clubStatePath,
  CLUB_COLLECTIONS,
  DEFAULT_CLUB_ID,
} from "./clubPaths";

import {
  dataScopeCollectionPath,
  dataScopeDocPath,
  dataScopeStatePath,
  normalizeDataScope,
} from "./dataScope.js";


/*
 * ============================================================
 * DATA-SCOPE-AWARE FIRESTORE REFERENCES
 *
 * These are the canonical references for code that may operate
 * against either Official or Practice football data.
 *
 * Existing getClub* helpers below remain Official-only for
 * backwards compatibility during the Practice v2 migration.
 * ============================================================
 */

export function getScopedStateDoc(db, scope) {
  const normalizedScope = normalizeDataScope(scope);
  return doc(db, dataScopeStatePath(normalizedScope));
}

export function getScopedCollection(
  db,
  collectionName,
  scope
) {
  const normalizedScope = normalizeDataScope(scope);

  return collection(
    db,
    dataScopeCollectionPath(
      collectionName,
      normalizedScope
    )
  );
}

export function getScopedDoc(
  db,
  collectionName,
  docId,
  scope
) {
  const normalizedScope = normalizeDataScope(scope);

  return doc(
    db,
    dataScopeDocPath(
      collectionName,
      docId,
      normalizedScope
    )
  );
}

export function getClubStateDoc(db, clubId = DEFAULT_CLUB_ID) {
  return doc(db, clubStatePath(clubId));
}

export function getClubCollection(
  db,
  collectionName,
  clubId = DEFAULT_CLUB_ID
) {
  return collection(db, clubCollectionPath(collectionName, clubId));
}

export function getClubDoc(
  db,
  collectionName,
  docId,
  clubId = DEFAULT_CLUB_ID
) {
  return doc(db, clubDocPath(collectionName, docId, clubId));
}

export function getPlayersCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.players, clubId);
}

export function getPlayerDoc(db, playerId, clubId = DEFAULT_CLUB_ID) {
  return getClubDoc(db, CLUB_COLLECTIONS.players, playerId, clubId);
}

export function getMembersCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.members, clubId);
}

export function getMatchSignupsCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.matchSignups, clubId);
}

export function getPendingSignupsCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.pendingSignups, clubId);
}

export function getPeerRatingsCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.peerRatings, clubId);
}

export function getPeerRatingBaselinesCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(db, CLUB_COLLECTIONS.peerRatingBaselines, clubId);
}

export function getPlayerPhotosCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.playerPhotos, clubId);
}

export function getMatchesCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.matches, clubId);
}

export function getMatchDoc(db, docId, clubId = DEFAULT_CLUB_ID) {
  return getClubDoc(db, CLUB_COLLECTIONS.matches, docId, clubId);
}

export function getNewsStoriesCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.newsStories, clubId);
}

export function getVideoHighlightsCollection(db, clubId = DEFAULT_CLUB_ID) {
  return getClubCollection(db, CLUB_COLLECTIONS.videoHighlights, clubId);
}