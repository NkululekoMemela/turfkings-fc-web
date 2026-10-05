import {doc, getDoc} from "firebase/firestore";
import {auth, db} from "../firebaseConfig.js";
import {getSeasonSquadView} from "./fieldSeasonSquadRepository.js";

const records = new Map();
const lifetimeMs = 10000;

export async function loadClubLeagueSeason(clubId, user, {force = false} = {}) {
  if (!user?.uid || !clubId) return null;
  const key = JSON.stringify([user.uid, clubId]);
  const previous = records.get(key);
  if (!force && previous && Date.now() - previous.startedAt < lifetimeMs) {
    return previous.promise;
  }

  const record = {startedAt: Date.now()};
  record.promise = (async () => {
    const membership = await getDoc(doc(db, "clubFieldMemberships", clubId));
    const link = membership.data();
    if (link?.status !== "active" || !link.venueId) return null;
    const snapshot = await getDoc(doc(db, "leagueVenues", link.venueId));
    const venue = snapshot.data();
    const season = venue?.league?.activeSeason;
    if (!season?.id || season.status !== "active" ||
        !season.clubIds?.includes(clubId)) return null;
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error("Your account changed. Open your league squad again.");
    }
    const scope = {clubId, venueId: link.venueId, seasonId: season.id};
    const view = await getSeasonSquadView(scope);
    if (auth.currentUser?.uid !== user.uid) {
      throw new Error("Your account changed. Open your league squad again.");
    }
    return {scope, venue, season, view};
  })();

  records.set(key, record);
  try {
    return await record.promise;
  } catch (error) {
    if (records.get(key) === record) records.delete(key);
    throw error;
  }
}
