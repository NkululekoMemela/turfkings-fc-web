// src/core/clubPaths.js

export const DEFAULT_CLUB_ID = "turf-kings";

export function clubRoot(clubId = DEFAULT_CLUB_ID) {
  return `clubs/${clubId}`;
}

export function clubStatePath(clubId = DEFAULT_CLUB_ID) {
  return `${clubRoot(clubId)}/state/main`;
}

export function clubCollectionPath(collectionName, clubId = DEFAULT_CLUB_ID) {
  return `${clubRoot(clubId)}/${collectionName}`;
}

export function clubDocPath(collectionName, docId, clubId = DEFAULT_CLUB_ID) {
  return `${clubRoot(clubId)}/${collectionName}/${docId}`;
}

export const CLUB_COLLECTIONS = {
  players: "players",
  members: "members",
  humanMembers: "humanMembers",
  matchSignups: "matchSignups",
  matchCredits: "matchCredits",
  payments: "payments",
  peerRatings: "peerRatings",
  peerRatingBaselines: "peerRatingBaselines",
  playerPhotos: "playerPhotos",
  pendingSignups: "pendingSignups",
  newsStories: "newsStories",
  videoHighlights: "video_highlights",
  seasons: "seasons",
  matches: "matches",
  kitOrders: "kitOrders",
  yearEndConfig: "yearEndConfig",
  yearEndRSVP: "yearEndRSVP",
  yearEndRSVPWithdrawals: "yearEndRSVP_withdrawals",
};