import { auth, db } from "../firebaseConfig.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

function clean(value) {
  return String(value || "").trim();
}

function slug(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function watchLeagueVenues(onVenues, onError) {
  return onSnapshot(
    collection(db, "leagueVenues"),
    (snapshot) => {
      const venues = snapshot.docs
        .map((item) => ({ ...item.data(), id: item.id }))
        .filter((venue) => venue.visibility?.listed === true)
        .sort((a, b) => a.name.localeCompare(b.name));

      onVenues(venues);
    },
    onError
  );
}

export async function createLeagueVenue({
  name,
  city,
  suburb = "",
  address = "",
  websiteUrl = "",
}) {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error("Sign in before registering a league venue.");

  const venueName = clean(name);
  const venueCity = clean(city);
  if (!venueName) throw new Error("Venue name is required.");
  if (!venueCity) throw new Error("City is required.");

  const website = clean(websiteUrl);
  if (website && !/^https?:\/\/[^ ]+\.[^ ]+/i.test(website)) {
    throw new Error("Enter a complete website address beginning with https://");
  }

  const venueId = `${slug(venueName) || "venue"}-${user.uid.slice(0, 8)}`;
  const venueRef = doc(db, "leagueVenues", venueId);
  if ((await getDoc(venueRef)).exists()) {
    throw new Error("You already registered a venue with this name.");
  }

  const venue = {
    id: venueId,
    name: venueName,
    location: {
      city: venueCity,
      suburb: clean(suburb),
      address: clean(address),
      country: "South Africa",
    },
    websiteUrl: website,
    ownerUid: user.uid,
    adminUids: [user.uid],
    branding: { logoUrl: "", accent: "#16a34a" },
    visibility: { listed: true },
    status: "setup_pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(venueRef, venue);
  return { ...venue, id: venueId };
}
