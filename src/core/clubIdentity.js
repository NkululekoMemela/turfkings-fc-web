// src/core/clubIdentity.js
import TurfKingsLogo from "../assets/TurfKings_logo.jpeg";
import TurfKingsTransparentLogo from "../assets/TurfKings_logo_transparent.png";
import TurfKingsHero from "../assets/TurfKings.jpg";
import TurfKingsHero2 from "../assets/TurfKings2.jpeg";
import TurfKingsHero3 from "../assets/TurfKings3.jpeg";

export const DEFAULT_CLUB_ID = "turf-kings";
export const DEFAULT_CLUB_NAME = "Turf Kings FC";
export const DEFAULT_CLUB_SHORT_NAME = "Turf Kings";
export const DEFAULT_PLATFORM_LOGO = "/HomePage/Logo_icon.jpeg";

function cleanString(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function normalizeClubId(value) {
  return (
    cleanString(value, DEFAULT_CLUB_ID)
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "") || DEFAULT_CLUB_ID
  );
}

function firstAvailable(...values) {
  return values.find((value) => cleanString(value)) || "";
}

function galleryUrls(club = {}) {
  return Array.isArray(club?.media?.gallery)
    ? club.media.gallery.map((item) => item?.url || item).filter(Boolean)
    : [];
}

export function isTurfKingsClub(clubOrId) {
  const id = typeof clubOrId === "string" ? clubOrId : clubOrId?.id;
  return normalizeClubId(id) === DEFAULT_CLUB_ID;
}

export function buildClubIdentity(club = {}) {
  const id = normalizeClubId(club?.id || club?.clubId || DEFAULT_CLUB_ID);
  const turfKings = id === DEFAULT_CLUB_ID;

  const name = turfKings
    ? DEFAULT_CLUB_NAME
    : cleanString(club?.name || club?.clubName, "Unnamed Club");

  const shortName = turfKings
    ? DEFAULT_CLUB_SHORT_NAME
    : cleanString(club?.shortName || club?.displayName || name, name);

  const uploadedLogo = firstAvailable(
    club?.logoUrl,
    club?.branding?.uploadedLogoUrl,
    club?.media?.logoOriginalUrl,
    club?.media?.logoTransparentUrl,
    club?.logo,
    club?.logoPath,
    club?.badgeUrl,
    club?.badge,
    club?.image
  );

  const logo = turfKings ? TurfKingsLogo : uploadedLogo || DEFAULT_PLATFORM_LOGO;

  const uploadedHero = firstAvailable(
    club?.media?.coverImageUrl,
    galleryUrls(club)[0],
    club?.heroImage,
    club?.heroImageUrl,
    club?.teamPhoto,
    club?.teamPhotoUrl,
    club?.coverImage,
    club?.coverImageUrl,
    club?.image,
    logo
  );

  const heroImage = turfKings ? TurfKingsHero : uploadedHero || DEFAULT_PLATFORM_LOGO;

  const heroImages = turfKings
    ? [TurfKingsHero, TurfKingsHero2, TurfKingsHero3]
    : [
        club?.media?.coverImageUrl,
        ...galleryUrls(club),
        club?.heroImage,
        club?.heroImageUrl,
        club?.teamPhoto,
        club?.teamPhotoUrl,
        club?.coverImage,
        club?.coverImageUrl,
        club?.image,
        logo,
      ].filter(Boolean);

  return {
    raw: club || {},
    id,
    name,
    shortName,
    displayName: shortName || name,
    isTurfKings: turfKings,

    logo,
    logoUrl: logo,
    transparentLogoUrl: turfKings
      ? TurfKingsTransparentLogo
      : firstAvailable(club?.media?.logoTransparentUrl, club?.branding?.transparentLogoUrl, logo),

    heroImage,
    heroImages: heroImages.length ? heroImages : [DEFAULT_PLATFORM_LOGO],

    location: cleanString(
      club?.locationDetails?.displayLocation ||
        club?.location ||
        club?.area ||
        club?.city ||
        club?.venue,
      turfKings ? "Grand Central (CT)" : "Location not set"
    ),

    weeklyPlayTime: cleanString(
      club?.schedule?.weeklyPlayTime ||
        club?.weeklyPlayTime ||
        club?.playTime,
      turfKings ? "Wednesdays, 17:30–19:00" : "Schedule not set"
    ),

    media: club?.media || {},
    branding: club?.branding || {},

    theme: {
      primary: cleanString(club?.primaryColor || club?.accent || club?.accentColor, "#22c55e"),
      secondary: cleanString(club?.secondaryColor, "#38bdf8"),
      background: cleanString(club?.backgroundColor, "#020617"),
    },
  };
}

export function getClubName(club = {}) {
  return buildClubIdentity(club).name;
}

export function getClubShortName(club = {}) {
  return buildClubIdentity(club).shortName;
}

export function getClubLogo(club = {}) {
  return buildClubIdentity(club).logo;
}

export function getClubTransparentLogo(club = {}) {
  return buildClubIdentity(club).transparentLogoUrl;
}

export function getClubHeroImage(club = {}) {
  return buildClubIdentity(club).heroImage;
}

export function getClubHeroImages(club = {}) {
  return buildClubIdentity(club).heroImages;
}