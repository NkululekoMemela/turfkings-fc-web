import {doc, getDoc, setDoc, serverTimestamp} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
const DEFAULT_CLUB_ID = "turf-kings";
function toTitleCase(name) {
  return String(name || "").trim().toLowerCase().split(/\s+/).filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
}
function slugFromName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}
function playerPhotoDocRef(clubId, id) { return doc(db, "clubs", clubId, "playerPhotos", id); }

function getPhotoDocIdsFromIdentity({ fullName = "", shortName = "", playerId = "" }) {
  const ids = [
    String(playerId || "").trim(),
    slugFromName(toTitleCase(fullName || "")),
    slugFromName(toTitleCase(shortName || "")),
    slugFromName(toTitleCase(shortName || fullName || "")),
  ].filter(Boolean);

  return Array.from(new Set(ids));
}

export async function findExistingPhotoDataByIdentity(identityLike, clubId = DEFAULT_CLUB_ID) {
  const ids = getPhotoDocIdsFromIdentity(identityLike);

  for (const id of ids) {
    try {
      const snap = await getDoc(doc(db,"clubs",clubId,"publicPlayerPhotos",id));
      if (snap.exists()) {
        const data = snap.data() || {};
        if (data.photoData) {
          return {
            id,
            photoData: data.photoData,
            data,
          };
        }
      }
    } catch (err) {
      console.error("[EntryPage] Failed checking player photo:", err);
    }
  }

  return null;
}

export async function savePlayerPhotoForIdentity({
  clubId = DEFAULT_CLUB_ID,
  fullName = "",
  shortName = "",
  playerId = "",
  email = "",
  role = "player",
  status = "active",
  sourceMemberId = "",
  photoData = "",
  writer = null,
}) {
  const preferredId =
    String(playerId || "").trim() ||
    slugFromName(toTitleCase(shortName || fullName || ""));

  if (!preferredId || !photoData) return null;

  const writePhoto = writer
    ? (reference, data, options) => writer.set(reference, data, options)
    : setDoc;
  await writePhoto(
    playerPhotoDocRef(clubId, preferredId),
    {
      name: toTitleCase(fullName || shortName || preferredId),
      shortName: toTitleCase(shortName || fullName || preferredId),
      email: String(email || "").trim(),
      sourceMemberId: sourceMemberId || null,
      role,
      status,
      photoData,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return preferredId;
}
