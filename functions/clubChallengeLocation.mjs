export function challengeClubPoint(club) {
  const point = club?.locationDetails || {};
  const coordinates = club?.coordinates || {};
  const lat = point.latitude ?? point.lat ?? coordinates.latitude ?? coordinates.lat ?? club?.latitude ?? club?.lat;
  const lng = point.longitude ?? point.lng ?? point.lon ?? coordinates.longitude ?? coordinates.lng ?? coordinates.lon ?? club?.longitude ?? club?.lng ?? club?.lon;
  if (lat == null || lng == null || String(lat).trim() === "" || String(lng).trim() === "") return null;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)
    ? {latitude, longitude} : null;
}

export function challengeDistanceKm(home, away) {
  const a = challengeClubPoint(home), b = challengeClubPoint(away);
  if (!a || !b) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const distance = Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) *
    Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, distance)));
}

export const FANM_CHALLENGE_ORGANISERS = Object.freeze(["nkululekolerato@gmail.com", "5asidesnearme@gmail.com"]);
