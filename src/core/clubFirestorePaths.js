// src/core/clubFirestorePaths.js

import {
  collection,
  doc,
} from "firebase/firestore";

import {
  clubCollectionPath,
  clubDocPath,
  clubStatePath,
  CLUB_COLLECTIONS,
  DEFAULT_CLUB_ID,
} from "./clubPaths";

export function getClubStateDoc(db, clubId = DEFAULT_CLUB_ID) {
  return doc(db, clubStatePath(clubId));
}

export function getClubCollection(
  db,
  collectionName,
  clubId = DEFAULT_CLUB_ID
) {
  return collection(
    db,
    clubCollectionPath(collectionName, clubId)
  );
}

export function getClubDoc(
  db,
  collectionName,
  docId,
  clubId = DEFAULT_CLUB_ID
) {
  return doc(
    db,
    clubDocPath(collectionName, docId, clubId)
  );
}

/*
|--------------------------------------------------------------------------
| Convenience helpers
|--------------------------------------------------------------------------
*/

export function getPlayersCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(
    db,
    CLUB_COLLECTIONS.players,
    clubId
  );
}

export function getPlayerDoc(
  db,
  playerId,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubDoc(
    db,
    CLUB_COLLECTIONS.players,
    playerId,
    clubId
  );
}

export function getMembersCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(
    db,
    CLUB_COLLECTIONS.members,
    clubId
  );
}

export function getMatchSignupsCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(
    db,
    CLUB_COLLECTIONS.matchSignups,
    clubId
  );
}

export function getPeerRatingsCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(
    db,
    CLUB_COLLECTIONS.peerRatings,
    clubId
  );
}

export function getMatchesCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(
    db,
    CLUB_COLLECTIONS.matches,
    clubId
  );
}

export function getNewsStoriesCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(
    db,
    CLUB_COLLECTIONS.newsStories,
    clubId
  );
}

export function getVideoHighlightsCollection(
  db,
  clubId = DEFAULT_CLUB_ID
) {
  return getClubCollection(
    db,
    CLUB_COLLECTIONS.videoHighlights,
    clubId
  );
}