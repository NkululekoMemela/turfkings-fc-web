// src/storage/homePageHubClubRepository.js

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import { auth, db } from "../firebaseConfig";

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

async function buildUniqueClubPersonId(clubId, preferredId) {
  const baseId = slugFromName(preferredId) || "player";
  let candidate = baseId;
  let suffix = 2;

  while (true) {
    const memberSnap = await getDoc(doc(db, "clubs", clubId, "members", candidate));
    const playerSnap = await getDoc(doc(db, "clubs", clubId, "players", candidate));

    if (!memberSnap.exists() && !playerSnap.exists()) return candidate;

    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }
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
  const normalMatchFee = Number(bankingDraft.normalMatchFee || 0);
  const platformContributionPerPlayer = 7.5;
  const playerCharge = normalMatchFee > 0
    ? normalMatchFee + platformContributionPerPlayer
    : 0;

  return {
    bankName: cleanText(bankingDraft.bankName),
    accountHolder: cleanText(bankingDraft.accountHolder),
    accountNumber: cleanText(bankingDraft.accountNumber),
    branchCode: cleanText(bankingDraft.branchCode),
    paymentReference: cleanText(bankingDraft.paymentReference),
    normalMatchFee,
    platformContributionPerPlayer,
    playerCharge,
    currency: "ZAR",
    paymentProvider: "peach_payments_pending",
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

async function uploadBlobToStorage({ clubId, blob, folder, prefix, fileName = "logo-transparent.png" }) {
  if (!blob) return "";

  const storage = getStorage();
  const path = `clubs/${clubId}/${folder}/${Date.now()}_${prefix}_${safeFileName(fileName)}`;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, blob, {
    contentType: blob.type || "image/png",
  });

  return getDownloadURL(fileRef);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };

    img.src = url;
  });
}

async function makeTransparentLogoBlob(file) {
  if (!file || typeof document === "undefined") return null;

  const img = await loadImageFromFile(file);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const scale = Math.min(size / img.width, size / img.height) * 0.92;
  const drawW = Math.round(img.width * scale);
  const drawH = Math.round(img.height * scale);
  const x = Math.round((size - drawW) / 2);
  const y = Math.round((size - drawH) / 2);

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, x, y, drawW, drawH);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const isPaleBackground =
      r > 238 &&
      g > 238 &&
      b > 238 &&
      Math.max(r, g, b) - Math.min(r, g, b) < 22;

    if (isPaleBackground) {
      data[i + 3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
  });
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
  const captainWhatsApp = cleanText(clubDraft.captainWhatsAppNormalised || clubDraft.captainWhatsApp);
  const captainPhotoUrl = cleanText(clubDraft.captainPhotoUrl);
  const platformIdentityUid = cleanText(clubDraft.platformIdentityUid);

  if (!safeClubId) throw new Error("Club ID is required.");
  if (!clubName) throw new Error("Club name is required.");
  if (!captainName) throw new Error("Captain name is required.");
  if (!captainEmail) throw new Error("Captain email is required.");

  const now = serverTimestamp();

  /*
   * Create the Firestore club records first.
   * Branding is saved afterwards through updateHomePageHubClub().
   */
  const uploadedLogoUrlFromFile = "";
  const uploadedTransparentLogoUrlFromFile = "";
  const uploadedGallery = [];
  const uploadedLogoUrl = "";

  const creatorUser = auth.currentUser || null;
  const creatorUid = creatorUser?.uid || "";
  const creatorEmail = cleanEmail(creatorUser?.email || captainEmail);

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
  const captainPlayerId = await buildUniqueClubPersonId(
    safeClubId,
    creatorUid || captainEmail || captainName || captainShortName
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
      latitude: Number.isFinite(Number(clubDraft.latitude)) ? Number(clubDraft.latitude) : null,
      longitude: Number.isFinite(Number(clubDraft.longitude)) ? Number(clubDraft.longitude) : null,
      placeId: cleanText(clubDraft.googlePlaceId || clubDraft.placeId),
      verificationStatus: cleanText(clubDraft.venueVerificationStatus) || "captain_confirmed_pending_review",
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
      whatsappNumber: captainWhatsApp,
      phoneNumber: captainWhatsApp,
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
      logoTransparentUrl: uploadedTransparentLogoUrlFromFile || uploadedLogoUrl,
    },

    status: "setup_pending",
    onboardingComplete: false,
    onboardingStep: "badge",

    visibility: {
      listedOnHomePage: false,
      acceptingPlayers: false,
      acceptingChallenges: false,
    },

    description: "",
    createdBy: creatorEmail,
    createdByEmail: creatorEmail,
    createdByUid: creatorUid,
    ownerUid: creatorUid,
    ownerEmail: creatorEmail,
    adminUids: creatorUid ? [creatorUid] : [],
    adminEmails: creatorEmail ? [creatorEmail] : [captainEmail],
    createdAt: now,
    captain: captainName || captainEmail ? {
      name: captainName,
      email: captainEmail,
      whatsappNumber: captainWhatsApp,
      phoneNumber: captainWhatsApp,
      playerId: captainPlayerId,
    } : undefined,

    updatedAt: now,
  };

  await setDoc(doc(db, "clubs", safeClubId), clubPayload, { merge: true });

  await setDoc(
    doc(db, "clubs", safeClubId, "state", "main"),
    {
      activeMatch: null,
      signupOpen: false,
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
      whatsappNumber: captainWhatsApp,
      phoneNumber: captainWhatsApp,
      photoUrl: captainPhotoUrl,
      platformIdentityUid: platformIdentityUid || creatorUid,
      platformIdentityConfirmed:
        clubDraft.platformIdentityConfirmed === true,
      role: "admin",
      status: "active",
      uid: creatorUid,
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
      whatsappNumber: captainWhatsApp,
      phoneNumber: captainWhatsApp,
      photoUrl: captainPhotoUrl,
      platformIdentityUid: platformIdentityUid || creatorUid,
      platformIdentityConfirmed:
        clubDraft.platformIdentityConfirmed === true,
      roles: {
        player: true,
        captain: true,
        admin: true,
      },
      status: "active",
      uid: creatorUid,
      sourceMemberId: captainPlayerId,
      createdAt: now,
      updatedAt: now,
      source: "homepage_hub_club_registration",
    },
    { merge: true }
  );

  console.log("[Repository] About to enter badge update phase");

  try {
    console.log("[Repository] Calling updateHomePageHubClub()");

    const completedClub = await updateHomePageHubClub({
      clubId: safeClubId,
      clubDraft: {
        ...clubDraft,
        captainName,
      },
      logoDraft,
      bankingDraft,
    });

    await setDoc(
      doc(db, "clubs", safeClubId, "state", "main"),
      {
        signupOpen: true,
        seasonStatus: "setup",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("[Repository] Badge update completed successfully");

    return {
      ...clubPayload,
      ...completedClub,
      id: safeClubId,
      mediaSetupPending: false,
    };
  } catch (mediaError) {
    console.error("[Repository] Badge update failed but should recover", mediaError);
    console.warn(
      `Club ${safeClubId} was created, but its badge could not be saved.`,
      mediaError
    );

    return {
      ...clubPayload,
      id: safeClubId,
      mediaSetupPending: true,
      mediaSetupErrorCode: cleanText(mediaError?.code),
    };
  }
}

export async function updateHomePageHubClub({
  clubId,
  clubDraft = {},
  logoDraft = {},
  bankingDraft = {},
}) {
  const safeClubId = cleanText(clubId);

  if (!safeClubId) throw new Error("Club ID is required.");

  const now = serverTimestamp();

  const creatorUser = auth.currentUser || null;
  const creatorUid = creatorUser?.uid || "";

  const uploadedLogoUrlFromFile = await uploadFileToStorage({
    clubId: safeClubId,
    file: logoDraft.logoFile,
    folder: "branding",
    prefix: "logo_update",
  });

  const uploadedTransparentLogoUrlFromFile = logoDraft.logoFile
    ? await uploadBlobToStorage({
        clubId: safeClubId,
        blob: await makeTransparentLogoBlob(logoDraft.logoFile),
        folder: "branding",
        prefix: "logo_transparent_update",
        fileName: "logo-transparent.png",
      })
    : "";

  const uploadedGallery = await uploadGalleryFiles({
    clubId: safeClubId,
    files: logoDraft.galleryFiles,
  });

  const uploadedLogoUrl =
    uploadedLogoUrlFromFile ||
    cleanText(logoDraft.uploadedLogoUrl) ||
    cleanText(logoDraft.generatedLogoDataUrl);

  const selectedGeneratedLogo = cleanText(logoDraft.selectedGeneratedLogoId);
  const generatedLogoPrompt = cleanText(logoDraft.generatedLogoPrompt);
  const generatedLogoSvg = cleanText(logoDraft.generatedLogoSvg);
  const generatedLogoDataUrl = cleanText(logoDraft.generatedLogoDataUrl);

  const locationDisplay = buildDisplayLocation(clubDraft);
  const fullAddress = buildFullAddress(clubDraft);
  const weeklyPlayTime = buildWeeklyPlayTime(clubDraft);

  const captainName = toTitleCase(
    cleanText(clubDraft.captainName) ||
    `${cleanText(clubDraft.founderFirstName)} ${cleanText(clubDraft.founderSurname)}`.trim()
  );
  const captainEmail = cleanEmail(clubDraft.captainEmail);
  const captainWhatsApp = cleanText(clubDraft.captainWhatsAppNormalised || clubDraft.captainWhatsApp);
  const captainShortName =
    captainName.split(/\s+/).filter(Boolean)[0] || captainName;
  const captainPlayerId = slugFromName(
    creatorUid || captainEmail || captainName || captainShortName
  );

  const payload = {
    name: cleanText(clubDraft.clubName || clubDraft.name),
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
      latitude: Number.isFinite(Number(clubDraft.latitude)) ? Number(clubDraft.latitude) : null,
      longitude: Number.isFinite(Number(clubDraft.longitude)) ? Number(clubDraft.longitude) : null,
      placeId: cleanText(clubDraft.googlePlaceId || clubDraft.placeId),
      verificationStatus: cleanText(clubDraft.venueVerificationStatus) || "captain_confirmed_pending_review",
    },

    schedule: {
      playDay: cleanText(clubDraft.playDay),
      playTime: cleanText(clubDraft.playTime),
      weeklyPlayTime: weeklyPlayTime || "Play time to be confirmed",
      timezone: cleanText(clubDraft.timezone) || "Africa/Johannesburg",
    },

    accent: cleanText(clubDraft.accent) || "#16a34a",
    logoText:
      cleanText(clubDraft.logoText) ||
      cleanText(clubDraft.clubName || clubDraft.name).slice(0, 2).toUpperCase(),

    captain: captainName || captainEmail ? {
      name: captainName,
      email: captainEmail,
      whatsappNumber: captainWhatsApp,
      phoneNumber: captainWhatsApp,
      playerId: captainPlayerId,
    } : undefined,

    updatedAt: now,
  };

  const hasSavedBadge = Boolean(
    uploadedLogoUrl || selectedGeneratedLogo
  );

  if (hasSavedBadge) {
    if (uploadedLogoUrl) {
      payload.image = uploadedLogoUrl;
      payload.logoUrl = uploadedLogoUrl;
    }

    payload.status = "active";
    payload.onboardingComplete = true;
    payload.onboardingStep = "complete";

    payload.visibility = {
      listedOnHomePage: true,
      acceptingPlayers: true,
      acceptingChallenges: true,
    };

    payload.branding = {
      uploadedLogoUrl,
      selectedGeneratedLogo,
      generatedLogoPrompt,
      generatedLogoSvg,
      generatedLogoDataUrl,
      transparentTwinStatus:
        selectedGeneratedLogo || uploadedLogoUrl ? "pending" : "not_started",
      logoSource: uploadedLogoUrlFromFile
        ? "uploaded_file"
        : generatedLogoDataUrl
          ? "generated_svg"
          : selectedGeneratedLogo
            ? "prepared_ai_prompt"
            : "external_url",
    };

    payload.banking = cleanBankingDraft(bankingDraft);

    if (uploadedLogoUrl || uploadedGallery.length) {
      payload.media = {
        ...(uploadedLogoUrl
          ? {
              logoOriginalUrl: uploadedLogoUrl,
              logoTransparentUrl:
                uploadedTransparentLogoUrlFromFile || uploadedLogoUrl,
            }
          : {}),
        ...(uploadedGallery.length
          ? {
              coverImageUrl: uploadedGallery[0]?.url || "",
              gallery: uploadedGallery,
            }
          : {}),
      };
    }
  } else if (uploadedGallery.length) {
    payload.media = {
      coverImageUrl: uploadedGallery[0]?.url || "",
      gallery: uploadedGallery,
    };
  }

  await setDoc(doc(db, "clubs", safeClubId), payload, { merge: true });

  return {
    id: safeClubId,
    ...payload,
  };
}
