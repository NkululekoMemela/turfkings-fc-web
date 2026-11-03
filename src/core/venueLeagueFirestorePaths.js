import { collection, doc } from "firebase/firestore";

import {
  normalizeVenueLeagueScope,
  venueLeagueRootPath,
  venueLeagueCollectionPath,
  venueLeagueDocPath,
  venueLeagueSeasonPath,
  venueLeagueSeasonCollectionPath,
  venueLeagueSeasonDocPath,
} from "./venueLeaguePaths.js";

export function getVenueLeagueRootDoc(db, scope) {
  const normalized = normalizeVenueLeagueScope(scope);
  return doc(db, venueLeagueRootPath(normalized));
}

export function getVenueLeagueCollection(
  db,
  collectionName,
  scope
) {
  const normalized = normalizeVenueLeagueScope(scope);

  return collection(
    db,
    venueLeagueCollectionPath(collectionName, normalized)
  );
}

export function getVenueLeagueDoc(
  db,
  collectionName,
  documentId,
  scope
) {
  const normalized = normalizeVenueLeagueScope(scope);

  return doc(
    db,
    venueLeagueDocPath(
      collectionName,
      documentId,
      normalized
    )
  );
}

export function getVenueLeagueSeasonDoc(db, scope) {
  const normalized = normalizeVenueLeagueScope(
    scope,
    { requireSeason: true }
  );

  return doc(db, venueLeagueSeasonPath(normalized));
}

export function getVenueLeagueSeasonCollection(
  db,
  collectionName,
  scope
) {
  const normalized = normalizeVenueLeagueScope(
    scope,
    { requireSeason: true }
  );

  return collection(
    db,
    venueLeagueSeasonCollectionPath(
      collectionName,
      normalized
    )
  );
}

export function getVenueLeagueSeasonItemDoc(
  db,
  collectionName,
  documentId,
  scope
) {
  const normalized = normalizeVenueLeagueScope(
    scope,
    { requireSeason: true }
  );

  return doc(
    db,
    venueLeagueSeasonDocPath(
      collectionName,
      documentId,
      normalized
    )
  );
}
