import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebaseConfig";

function normalizeText(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeEmail(value = "") {
  return normalizeText(value);
}

function slugFromName(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

async function loadSourcePlayerPhoto(candidate = {}) {
  if (!candidate.clubId) return "";

  const possibleIds = Array.from(
    new Set(
      [
        String(candidate.playerId || "").trim(),
        String(candidate.memberId || "").trim(),
        slugFromName(candidate.fullName),
        slugFromName(candidate.shortName),
        slugFromName(
          [candidate.firstName, candidate.surname]
            .filter(Boolean)
            .join(" ")
        ),
        slugFromName(candidate.firstName),
      ].filter(Boolean)
    )
  );

  for (const photoId of possibleIds) {
    try {
      const photoSnap = await getDoc(
        doc(
          db,
          "clubs",
          candidate.clubId,
          "playerPhotos",
          photoId
        )
      );

      if (!photoSnap.exists()) continue;

      const photoData = String(
        photoSnap.data()?.photoData || ""
      ).trim();

      if (photoData) {
        console.log(
          "[PlatformIdentity] Reused profile photo:",
          candidate.clubId,
          photoId
        );
        return photoData;
      }
    } catch (error) {
      console.warn(
        "[PlatformIdentity] Could not load source player photo:",
        candidate.clubId,
        photoId,
        error
      );
    }
  }

  console.warn(
    "[PlatformIdentity] No reusable player photo found:",
    candidate.clubId,
    possibleIds
  );

  return "";
}

function splitFullName(value = "") {
  const parts = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean);

  return {
    firstName: parts[0] || "",
    surname: parts.slice(1).join(" "),
  };
}

function identityCompleteness(candidate = {}) {
  return [
    candidate.photoUrl,
    candidate.whatsappNumber,
    candidate.phoneNumber,
    candidate.uid,
  ].filter(Boolean).length;
}

export function calculateIdentityConfidence(candidate = {}, identity = {}) {
  let score = 0;

  if (
    normalizeText(candidate.firstName) &&
    normalizeText(candidate.firstName) === normalizeText(identity.firstName)
  ) {
    score += 20;
  }

  if (
    normalizeText(candidate.surname) &&
    normalizeText(candidate.surname) === normalizeText(identity.surname)
  ) {
    score += 20;
  }

  if (
    normalizeEmail(candidate.email) &&
    normalizeEmail(candidate.email) === normalizeEmail(identity.email)
  ) {
    score += 100;
  }

  return score;
}

export async function findCandidatePlatformIdentity(identity = {}) {
  const email = normalizeEmail(identity.email);
  const firstName = normalizeText(identity.firstName);
  const surname = normalizeText(identity.surname);

  if (!email || !firstName || !surname) return [];

  console.log("[IdentityDebug] Looking up:", {
    firstName,
    surname,
    email,
  });

  const membersSnap = await getDocs(
    query(
      collectionGroup(db, "members"),
      where("email", "==", email)
    )
  );

  console.log(
    "[IdentityDebug] Matching member documents:",
    membersSnap.size
  );

  const rawCandidates = [];

  membersSnap.forEach((memberSnap) => {
    const data = memberSnap.data() || {};
    const names = splitFullName(data.fullName || data.name || "");

    console.log("[IdentityDebug] Firestore member:", {
      path: memberSnap.ref.path,
      clubId: memberSnap.ref.parent.parent?.id || "",
      documentId: memberSnap.id,
      storedFullName: data.fullName || "",
      storedName: data.name || "",
      parsedFirstName: names.firstName,
      parsedSurname: names.surname,
      storedEmail: data.email || "",
      whatsappNumber: data.whatsappNumber || "",
      phoneNumber: data.phoneNumber || "",
      uid: data.uid || "",
      platformIdentityUid: data.platformIdentityUid || "",
    });

    const candidate = {
      memberId: memberSnap.id,
      clubId: memberSnap.ref.parent.parent?.id || "",
      firstName: names.firstName,
      surname: names.surname,
      fullName:
        String(data.fullName || "").trim() ||
        [names.firstName, names.surname].filter(Boolean).join(" "),
      email: normalizeEmail(data.email),
      phoneNumber: String(data.phoneNumber || "").trim(),
      whatsappNumber: String(data.whatsappNumber || "").trim(),
      photoUrl: String(
        data.photoUrl ||
        data.profilePhotoUrl ||
        data.avatarUrl ||
        ""
      ).trim(),
      uid: String(data.uid || "").trim(),
    };

    const score = calculateIdentityConfidence(candidate, identity);

    if (score === 140) {
      rawCandidates.push({
        ...candidate,
        score,
      });
    }
  });

  const candidates = await Promise.all(
    rawCandidates.map(async (candidate) => {
      let clubName = candidate.clubId;

      if (candidate.clubId) {
        try {
          const clubSnap = await getDoc(
            doc(db, "clubs", candidate.clubId)
          );

          if (clubSnap.exists()) {
            const clubData = clubSnap.data() || {};
            clubName =
              String(
                clubData.name ||
                clubData.clubName ||
                candidate.clubId
              ).trim();
          }
        } catch (error) {
          console.warn(
            "[PlatformIdentity] Could not load source club:",
            candidate.clubId,
            error
          );
        }
      }

      const photoData = await loadSourcePlayerPhoto(
        candidate
      );

      return {
        ...candidate,
        clubName,
        photoData,
        photoUrl: candidate.photoUrl || photoData,
      };
    })
  );

  candidates.sort((a, b) => {
    const completenessDifference =
      identityCompleteness(b) - identityCompleteness(a);

    if (completenessDifference !== 0) {
      return completenessDifference;
    }

    return String(a.clubName || "").localeCompare(
      String(b.clubName || "")
    );
  });

  return candidates;
}
