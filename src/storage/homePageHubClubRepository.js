// src/storage/homePageHubClubRepository.js

import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../firebaseConfig";

function cleanText(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

export async function createHomePageHubClub({
  clubId,
  clubDraft = {},
  logoDraft = {},
  bankingDraft = {},
}) {
  const safeClubId = cleanText(clubId);

  const clubName = cleanText(
    clubDraft.clubName
  );

  const captainEmail = cleanEmail(
    clubDraft.captainEmail
  );

  const now = serverTimestamp();

  const clubPayload = {
    id: safeClubId,

    name: clubName,

    location:
      cleanText(clubDraft.suburb) ||
      cleanText(clubDraft.city),

    area:
      cleanText(clubDraft.suburb),

    locationDetails: {
      venueName: cleanText(
        clubDraft.venueName
      ),

      address: cleanText(
        clubDraft.address
      ),

      suburb: cleanText(
        clubDraft.suburb
      ),

      city: cleanText(
        clubDraft.city
      ),

      province: cleanText(
        clubDraft.province
      ),

      country: cleanText(
        clubDraft.country
      ),
    },

    schedule: {
      playDay: cleanText(
        clubDraft.playDay
      ),

      playTime: cleanText(
        clubDraft.playTime
      ),

      weeklyPlayTime:
        cleanText(
          clubDraft.weeklyPlayTime
        ),
    },

    branding: {
      uploadedLogoUrl:
        cleanText(
          logoDraft.uploadedLogoUrl
        ),

      selectedGeneratedLogo:
        cleanText(
          logoDraft.selectedGeneratedLogoId
        ),
    },

    banking: {
      bankName:
        cleanText(
          bankingDraft.bankName
        ),

      accountHolder:
        cleanText(
          bankingDraft.accountHolder
        ),

      accountNumber:
        cleanText(
          bankingDraft.accountNumber
        ),

      branchCode:
        cleanText(
          bankingDraft.branchCode
        ),
    },

    captain: {
      name: cleanText(
        clubDraft.captainName
      ),

      email: captainEmail,
    },

    geo: {
      lat: null,
      lng: null,
      geocodeStatus: "pending",
    },

    createdAt: now,
    updatedAt: now,
  };

  await setDoc(
    doc(db, "clubs", safeClubId),
    clubPayload,
    { merge: true }
  );

  await setDoc(
    doc(
      db,
      "clubs",
      safeClubId,
      "state",
      "main"
    ),
    {
      signupOpen: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await setDoc(
    doc(
      db,
      "clubs",
      safeClubId,
      "members",
      captainEmail
    ),
    {
      role: "captain",
      email: captainEmail,
      joinedAt: now,
    },
    { merge: true }
  );

  return clubPayload;
}