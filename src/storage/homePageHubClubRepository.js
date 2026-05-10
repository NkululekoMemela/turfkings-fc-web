// src/storage/homePageHubClubRepository.js

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import { db } from "../firebaseConfig";

function cleanText(value) {
  return String(value || "").trim();
}

function cleanEmail(value) {
  return cleanText(value).toLowerCase();
}

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugFromName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function safeFileName(name = "file") {
  return String(name || "file")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
}

function buildWeeklyPlayTime(clubDraft = {}) {
  const playDay = cleanText(clubDraft.playDay);
  const playTime = cleanText(clubDraft.playTime);

  if (playDay && playTime) return `${playDay}s · ${playTime}`;
  if (playDay) return `${playDay}s`;
  if (playTime) return playTime;
  return cleanText(clubDraft.weeklyPlayTime);
}

function buildDisplayLocation(clubDraft = {}) {
  return (
    [clubDraft.suburb, clubDraft.city]
      .map(cleanText)
      .filter(Boolean)
      .join(", ") ||
    cleanText(clubDraft.address) ||
    cleanText(clubDraft.venueName) ||
    cleanText(clubDraft.location) ||
    "Location to be confirmed"
  );
}

function buildFullAddress(clubDraft = {}) {
  return [
    clubDraft.venueName,
    clubDraft.address,
    clubDraft.suburb,
    clubDraft.city,
    clubDraft.province,
    clubDraft.country,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(", ");
}

function cleanBankingDraft(bankingDraft = {}) {
  return {
    bankName: cleanText(bankingDraft.bankName),
    accountHolder: cleanText(bankingDraft.accountHolder),
    accountNumber: cleanText(bankingDraft.accountNumber),
    branchCode: cleanText(bankingDraft.branchCode),
    paymentReference: cleanText(bankingDraft.paymentReference),
  };
}

async function uploadFileToStorage({ clubId, file, folder, prefix }) {
  if (!file) return "";

  const storage = getStorage();
  const path = `clubs/${clubId}/${folder}/${Date.now()}_${prefix}_${safeFileName(file.name)}`;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, file, {
    contentType: file.type || "application/octet-stream",
  });

  return getDownloadURL(fileRef);
}

async function uploadGalleryFiles({ clubId, files = [] }) {
  const cleanFiles = Array.from(files || []).filter(Boolean).slice(0, 3);

  const uploads = await Promise.all(
    cleanFiles.map(async (file, index) => {
      const url = await uploadFileToStorage({
        clubId,
        file,
        folder: "gallery",
        prefix: `photo_${index + 1}`,
      });

      return {
        url,
        name: file.name,
        type: file.type || "",
        size: file.size || 0,
        uploadedAt: new Date().toISOString(),
      };
    })
  );

  return uploads.filter((item) => item.url);
}

export async function createHomePageHubClub({
  clubId,
  clubDraft = {},
  logoDraft = {},
  bankingDraft = {},
}) {
  const safeClubId = cleanText(clubId);
  const clubName = cleanText(clubDraft.clubName);
  const captainName = toTitleCase(cleanText(clubDraft.captainName));
  const captainEmail = cleanEmail(clubDraft.captainEmail);

  if (!safeClubId) throw new Error("Club ID is required.");
  if (!clubName) throw new Error("Club name is required.");
  if (!captainName) throw new Error("Captain name is required.");
  if (!captainEmail) throw new Error("Captain email is required.");

  const now = serverTimestamp();

  const uploadedLogoUrlFromFile = await uploadFileToStorage({
    clubId: safeClubId,
    file: logoDraft.logoFile,
    folder: "branding",
    prefix: "logo",
  });

  const uploadedGallery = await uploadGalleryFiles({
    clubId: safeClubId,
    files: logoDraft.galleryFiles,
  });

  const uploadedLogoUrl =
    uploadedLogoUrlFromFile || cleanText(logoDraft.uploadedLogoUrl);

  const selectedGeneratedLogo = cleanText(logoDraft.selectedGeneratedLogoId);
  const generatedLogoPrompt = cleanText(logoDraft.generatedLogoPrompt);
  const locationDisplay = buildDisplayLocation(clubDraft);
  const fullAddress = buildFullAddress(clubDraft);
  const weeklyPlayTime = buildWeeklyPlayTime(clubDraft);

  const logoText =
    cleanText(clubDraft.logoText) ||
    clubName.slice(0, 2).toUpperCase();

  const captainShortName =
    captainName.split(/\s+/).filter(Boolean)[0] || captainName;
  const captainPlayerId = slugFromName(
    captainName || captainShortName || captainEmail
  );

  const clubPayload = {
    id: safeClubId,
    name: clubName,

    location: locationDisplay,
    area: cleanText(clubDraft.suburb) || cleanText(clubDraft.city) || locationDisplay,
    weeklyPlayTime: weeklyPlayTime || "Play time to be confirmed",

    locationDetails: {
      venueName: cleanText(clubDraft.venueName),
      address: cleanText(clubDraft.address),
      fullAddress,
      suburb: cleanText(clubDraft.suburb),
      city: cleanText(clubDraft.city),
      province: cleanText(clubDraft.province),
      country: cleanText(clubDraft.country) || "South Africa",
      displayLocation: locationDisplay,
    },

    schedule: {
      playDay: cleanText(clubDraft.playDay),
      playTime: cleanText(clubDraft.playTime),
      weeklyPlayTime: weeklyPlayTime || "Play time to be confirmed",
      timezone: cleanText(clubDraft.timezone) || "Africa/Johannesburg",
    },

    accent: cleanText(clubDraft.accent) || "#16a34a",
    activity: "New club",
    clubRating: "Unranked",
    helpNeeded: 0,
    members: 1,

    logoText,
    image: uploadedLogoUrl,
    logoUrl: uploadedLogoUrl,

    branding: {
      uploadedLogoUrl,
      selectedGeneratedLogo,
      generatedLogoPrompt,
      transparentTwinStatus:
        selectedGeneratedLogo || uploadedLogoUrl ? "pending" : "not_started",
      logoSource: uploadedLogoUrlFromFile
        ? "uploaded_file"
        : selectedGeneratedLogo
          ? "prepared_ai_prompt"
          : uploadedLogoUrl
            ? "external_url"
            : "initials",
    },

    banking: cleanBankingDraft(bankingDraft),

    captain: {
      name: captainName,
      email: captainEmail,
      playerId: captainPlayerId,
    },

    geo: {
      lat: null,
      lng: null,
      searchableLocation: fullAddress || locationDisplay,
      source: "manual_text_pending_geocode",
      geocodeStatus: fullAddress || locationDisplay ? "pending" : "not_started",
      geocodedAt: null,
    },

    media: {
      coverImageUrl: uploadedGallery[0]?.url || "",
      gallery: uploadedGallery,
      logoOriginalUrl: uploadedLogoUrl,
      logoTransparentUrl: "",
    },

    visibility: {
      listedOnHomePage: true,
      acceptingPlayers: true,
      acceptingChallenges: true,
    },

    description: "",
    createdBy: captainEmail,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, "clubs", safeClubId), clubPayload, { merge: true });

  await setDoc(
    doc(db, "clubs", safeClubId, "state", "main"),
    {
      activeMatch: null,
      signupOpen: true,
      seasonStatus: "setup",
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "clubs", safeClubId, "members", captainPlayerId),
    {
      fullName: captainName,
      shortName: captainShortName,
      email: captainEmail,
      whatsappNumber: "",
      role: "captain",
      status: "active",
      playerId: captainPlayerId,
      createdAt: now,
      updatedAt: now,
      source: "homepage_hub_club_registration",
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "clubs", safeClubId, "players", captainPlayerId),
    {
      name: captainShortName,
      fullName: captainName,
      shortName: captainShortName,
      email: captainEmail,
      roles: {
        player: true,
        captain: true,
        admin: true,
      },
      status: "active",
      sourceMemberId: captainPlayerId,
      createdAt: now,
      updatedAt: now,
      source: "homepage_hub_club_registration",
    },
    { merge: true }
  );

  return clubPayload;
}
