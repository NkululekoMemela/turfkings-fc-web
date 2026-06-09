// src/pages/HomePage_HUB.jsx

import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import "../styles/HomePage_HUB.css";
import HomePage_HUB_ClubCard from "../components/HomePage_HUB/HomePage_HUB_ClubCard.jsx";
import { getClubFeaturedHighlight } from "../storage/VideoHighlightsRepository.js";
import HomePage_HUB_SignupModal from "../components/HomePage_HUB/HomePage_HUB_SignupModal.jsx";
import HomePage_HUB_ClubProfileEditorModal from "../components/HomePage_HUB/HomePage_HUB_ClubProfileEditorModal.jsx";
import HOME_FOOTER_LOGO_LIGHT from "../assets/branding/logo-main-light.jpeg";
import HOME_FOOTER_LOGO_DAY from "../assets/branding/logo-main-day.jpeg";
import HOME_FOOTER_LOGO_DARK from "../assets/branding/logo-main-dark.jpeg";

const HOME_TOP_LOGO = "/HomePage_Hub/5_AsidesNearMe_light_logo.png";
const HOME_FALLBACK_LOGO = "/HomePage/Logo_icon.jpeg";
const SUPER_ADMIN_EMAILS = ["nkululekolerato@gmail.com"];
const CLUB_CACHE_KEY = "fanm_homepage_hub_clubs_v1";

const CAPE_TOWN_PLACEHOLDER_COORDS = {
  cbd: { latitude: -33.9249, longitude: 18.4241 },
  "cape town": { latitude: -33.9249, longitude: 18.4241 },
  claremont: { latitude: -33.9806, longitude: 18.4655 },
  wynberg: { latitude: -34.0046, longitude: 18.4680 },
  observatory: { latitude: -33.9408, longitude: 18.4666 },
  "sea point": { latitude: -33.9155, longitude: 18.3872 },
  bellville: { latitude: -33.9045, longitude: 18.6290 },
  "mitchells plain": { latitude: -34.0486, longitude: 18.6187 },
  khayelitsha: { latitude: -34.0390, longitude: 18.6770 },
  durbanville: { latitude: -33.8320, longitude: 18.6470 },
  rondebosch: { latitude: -33.9636, longitude: 18.4760 },
};

function getPlaceholderCoordsForClub(club = {}) {
  const text = [
    club?.mapLabel,
    club?.location,
    club?.area,
    club?.locationDetails?.displayLocation,
    club?.locationDetails?.fullAddress,
  ]
    .join(" ")
    .toLowerCase();

  const match = Object.entries(CAPE_TOWN_PLACEHOLDER_COORDS).find(([key]) =>
    text.includes(key)
  );

  if (match) return match[1];

  const fallbackKeys = Object.keys(CAPE_TOWN_PLACEHOLDER_COORDS);

  const randomKey =
    fallbackKeys[
      Math.floor(Math.random() * fallbackKeys.length)
    ];

  return CAPE_TOWN_PLACEHOLDER_COORDS[randomKey];
}

function getClubMarkerIcon(club = {}) {
  const label = String(club?.logoText || club?.shortName || club?.name || "FC")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  return L.divIcon({
    className: "hub-leaflet-marker",
    html: `<span>${label}</span>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18],
  });
}

const FALLBACK_CLUBS = [
  {
    id: "turf-kings",
    name: "Turf Kings",
    location: "Cape Town",
    weeklyPlayTime: "Wednesdays · 19:00",
    activity: "Founding club",
    accent: "#16a34a",
    logoText: "TK",
    description: "Weekly football, stats, payments and highlights.",
    highlightText: "Latest Turf Kings clips",
    mapLabel: "Cape Town",
  },
];

function safeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return safeText(value).toLowerCase();
}

function normalizeClub(docSnap) {
  const data = docSnap.data() || {};

  const uploadedLogo =
    data?.logoUrl ||
    data?.branding?.uploadedLogoUrl ||
    data?.media?.logoOriginalUrl ||
    data?.media?.logoTransparentUrl ||
    data?.image ||
    "";

  const gallery = Array.isArray(data?.media?.gallery)
    ? data.media.gallery.map((item) => item?.url || item).filter(Boolean)
    : [];

  const coverPhoto =
    data?.media?.coverImageUrl ||
    gallery[0] ||
    data?.heroImage ||
    data?.teamPhoto ||
    data?.image ||
    "";

  const hasLogo = Boolean(uploadedLogo);

  const hasPhotos =
    gallery.length > 0 ||
    Boolean(data?.media?.coverImageUrl) ||
    Boolean(data?.heroImage) ||
    Boolean(data?.teamPhoto);

  const hasBanking =
    Boolean(data?.banking?.accountNumber) ||
    Boolean(data?.banking?.accountName) ||
    Boolean(data?.banking?.accountHolder);

  const hasLocation =
    Boolean(data?.locationDetails?.displayLocation) ||
    Boolean(data?.locationDetails?.fullAddress) ||
    Boolean(data?.location) ||
    Boolean(data?.area);

  const hasSchedule =
    Boolean(data?.weeklyPlayTime) ||
    Boolean(data?.schedule?.weeklyPlayTime) ||
    Boolean(data?.schedule?.playDay) ||
    Boolean(data?.schedule?.playTime);

  return {
    id: docSnap.id,
    ...data,

    name: data.name || docSnap.id,

    logoUrl: uploadedLogo,
    image: uploadedLogo,

    heroImage: coverPhoto,
    heroImages: gallery,

    location:
      data?.locationDetails?.displayLocation ||
      data.location ||
      data.area ||
      "Location to be confirmed",

    weeklyPlayTime:
      data?.schedule?.weeklyPlayTime ||
      data.weeklyPlayTime ||
      data.playTime ||
      "Play time to be confirmed",

    accent: data.accent || "#16a34a",

    description:
      data.description ||
      data.summary ||
      "Club page, match nights and football highlights.",

    highlightText:
      data.highlightText ||
      data.latestHighlight ||
      data.latestVideoTitle ||
      "Highlights coming soon",

    mapLabel:
      data.mapLabel ||
      data.area ||
      data.location ||
      "Club location",

    completion: {
      hasLogo,
      hasPhotos,
      hasBanking,
      hasLocation,
      hasSchedule,
    },
  };
}

function getClubLatLng(club = {}) {
  const lat =
    club?.locationDetails?.latitude ??
    club?.locationDetails?.lat ??
    club?.coordinates?.latitude ??
    club?.coordinates?.lat ??
    club?.latitude ??
    club?.lat;

  const lng =
    club?.locationDetails?.longitude ??
    club?.locationDetails?.lng ??
    club?.locationDetails?.lon ??
    club?.coordinates?.longitude ??
    club?.coordinates?.lng ??
    club?.coordinates?.lon ??
    club?.longitude ??
    club?.lng ??
    club?.lon;

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return getPlaceholderCoordsForClub(club);
  }

  return { latitude, longitude };
}

function getMapPinStyle(club, index, clubs = []) {
  const point = getClubLatLng(club);
  const geoClubs = clubs
    .map(getClubLatLng)
    .filter(Boolean);

  if (point && geoClubs.length >= 2) {
    const lats = geoClubs.map((item) => item.latitude);
    const lngs = geoClubs.map((item) => item.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latRange = maxLat - minLat || 0.01;
    const lngRange = maxLng - minLng || 0.01;

    const x = 12 + ((point.longitude - minLng) / lngRange) * 76;
    const y = 82 - ((point.latitude - minLat) / latRange) * 64;

    return {
      left: `${Math.max(10, Math.min(90, x))}%`,
      top: `${Math.max(14, Math.min(84, y))}%`,
    };
  }

  const presets = [
    { left: "24%", top: "38%" },
    { left: "54%", top: "46%" },
    { left: "72%", top: "32%" },
    { left: "38%", top: "62%" },
    { left: "82%", top: "66%" },
    { left: "15%", top: "67%" },
  ];

  return presets[index] || { left: "50%", top: "50%" };
}

function getMissingClubRequirements(club = {}) {
  const missing = [];

  if (!club?.completion?.hasLogo) missing.push("Upload a club logo");
  if (!club?.completion?.hasPhotos) missing.push("Add up to 3 club/team photos");
  if (!club?.completion?.hasBanking) missing.push("Add banking details");
  if (!club?.completion?.hasLocation) missing.push("Complete club location");
  if (!club?.completion?.hasSchedule) missing.push("Add weekly play day/time");

  return missing;
}

function getClubAdminUids(club = {}) {
  return [
    club?.createdByUid,
    club?.ownerUid,
    ...(Array.isArray(club?.adminUids) ? club.adminUids : []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getClubAdminEmails(club = {}) {
  return [
    club?.createdBy,
    club?.createdByEmail,
    club?.ownerEmail,
    club?.adminEmail,
    club?.captainEmail,
    club?.captain?.email,
    ...(Array.isArray(club?.adminEmails) ? club.adminEmails : []),
    ...(Array.isArray(club?.captainEmails) ? club.captainEmails : []),
  ]
    .map(normalizeEmail)
    .filter(Boolean);
}

function isSuperAdmin(currentUser) {
  const email = normalizeEmail(currentUser?.email);
  return SUPER_ADMIN_EMAILS.includes(email);
}

function canCurrentUserManageClub(currentUser, club = {}) {
  const email = normalizeEmail(currentUser?.email);
  if (!email) return false;
  return isSuperAdmin(currentUser) || getClubAdminEmails(club).includes(email);
}



const HUB_INFO_CONTENT = {
  joinClub: {
    title: "How do I join a club?",
    body: [
      "Browse clubs using the rotating club cards or the interactive map.",
      "Select a club, open its club page, then choose Join Club.",
      "Complete the sign-up form with your name, surname, Gmail address and contact number.",
      "Once registered, you can sign up for upcoming match days inside that club.",
    ],
  },
  payments: {
    title: "How do payments work?",
    body: [
      "Payments are made to your club captain after you sign up as a player.",
      "Depending on the club setup, you may pay with Apple Pay, Google Pay or card payment to book your spot.",
      "Player contributions help the captain book the field and manage club running costs.",
      "Only pay through the official payment options shown inside the club.",
    ],
  },
  challengeClub: {
    title: "How do I challenge another club?",
    body: [
      "Club challenges are started by captains.",
      "Captains can use the Challenge option on another club's card or profile.",
      "If your team wants a challenge match, ask your captain to submit the challenge request on behalf of your club.",
      "The receiving captain can review, accept or decline the challenge.",
    ],
  },
  terms: {
    title: "Terms & Privacy",
    body: [
      "5 Asides Near Me is a football discovery, club management and match coordination platform.",
      "Players and captains must provide honest and accurate information when joining or creating clubs.",
      "Captains confirm that they are authorised to manage the club they create and must not create fake clubs, impersonate other clubs or collect money dishonestly.",
      "Captains are responsible for using player contributions for legitimate football-related club costs, including field bookings and agreed club expenses.",
      "The platform must not be used for fraud, money laundering, unlawful fundraising, fake club creation or any illegal financial activity.",
      "5 Asides Near Me may suspend, hide, investigate or remove clubs that appear fraudulent, misleading, abusive or unlawful.",
      "User information is used to operate the platform, manage club membership, support match coordination and communicate important club or support updates.",
      "This is a starter platform policy and should be reviewed by a qualified legal professional before full commercial launch.",
    ],
  },
};

function buildMailUrl({ subject = "5 Asides Near Me Support", body = "" } = {}) {
  const to = "support@5asidesnearme.com";
  const params = new URLSearchParams({
    to,
    su: subject,
    body,
  });
  return `https://mail.google.com/mail/?view=cm&fs=1&${params.toString()}`;
}


function uniqueSafeStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function hydrateClubHubStats(club) {
  if (!club?.id) return club;

  return {
    ...club,
    playerCount: Number.isFinite(Number(club.playerCount)) ? Number(club.playerCount) : 0,
    activityCount: Number.isFinite(Number(club.activityCount)) ? Number(club.activityCount) : 0,
  };
}


export default function HomePage_HUB({

  identity = null,
  onEnterTurfKings,
  onViewClub,
  onRegisterClub,
  onFindClub,
  onJoinClub,
  onChallengeClub,
  onNavigateToEntryPage,
}) {
  const [showTour, setShowTour] = React.useState(false);
  const [clubFeaturedVideos, setClubFeaturedVideos] = useState({});
  const [clubs, setClubs] = useState(() => {
    try {
      const cached = window.localStorage.getItem(CLUB_CACHE_KEY);
      const parsed = cached ? JSON.parse(cached) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [signupOpen, setSignupOpen] = useState(false);
  const [activeClub, setActiveClub] = useState(null);
  const [completionPromptClub, setCompletionPromptClub] = useState(null);
  const [profileEditorClub, setProfileEditorClub] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeMapClub, setActiveMapClub] = useState(null);
  const [clubSearchQuery, setClubSearchQuery] = useState("");
  const [challengeClub, setChallengeClub] = useState(null);
  const [challengeFormat, setChallengeFormat] = useState("5v5");
  const [challengeDate, setChallengeDate] = useState("");
  const [challengeKickoff, setChallengeKickoff] = useState("19:00");
  const [challengeMessage, setChallengeMessage] = useState("");
  const [challengeStatus, setChallengeStatus] = useState("");
  const [challengeError, setChallengeError] = useState("");
  const [isSubmittingChallenge, setIsSubmittingChallenge] = useState(false);
  const [deletingClubId, setDeletingClubId] = useState("");
  const [hubInfoModal, setHubInfoModal] = useState(null);
  const [hubContactModal, setHubContactModal] = useState(null);
  const [hubContactSubject, setHubContactSubject] = useState("");
  const [hubContactMessage, setHubContactMessage] = useState("");

  function openHubInfoModal(key) {
    setHubInfoModal(HUB_INFO_CONTENT[key] || null);
  }

  function openHubContactModal(type) {
    const isFeedback = type === "feedback";
    setHubContactModal(isFeedback ? "feedback" : "support");
    setHubContactSubject(isFeedback ? "5 Asides Near Me Feedback" : "5 Asides Near Me Support");
    setHubContactMessage("");
  }

  function sendHubContactMessage() {
    const subject = hubContactSubject || "5 Asides Near Me Support";
    const body = hubContactMessage || "";
    window.open(buildMailUrl({ subject, body }), "_blank", "noopener,noreferrer");
  }


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user || null);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadClubs() {
      try {
        setLoadingClubs(true);

        const snap = await getDocs(collection(db, "clubs"));
        const firebaseClubsRaw = snap.docs
          .map(normalizeClub)
          .filter((club) => {
            const status = String(club?.status || "").trim().toLowerCase();
            return status !== "deleted" && club?.deleted !== true;
          });
        const firebaseClubs = firebaseClubsRaw.map((club) => hydrateClubHubStats(club));

        if (!cancelled) {
          const nextClubs = firebaseClubs.length ? firebaseClubs : FALLBACK_CLUBS;
          setClubs(nextClubs);

          try {
            window.localStorage.setItem(CLUB_CACHE_KEY, JSON.stringify(nextClubs));
          } catch {
            // Ignore cache failures.
          }
        }
      } catch (error) {
        console.error("[HomePage_HUB] Failed to load clubs:", error);
        if (!cancelled) setClubs(FALLBACK_CLUBS);
      } finally {
        if (!cancelled) setLoadingClubs(false);
      }
    }

    loadClubs();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleClubs = useMemo(() => {
    const safeClubs = clubs.length ? clubs : FALLBACK_CLUBS;

    return safeClubs.slice().sort((a, b) => {
      if (a.id === "turf-kings") return -1;
      if (b.id === "turf-kings") return 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [clubs]);

  const filteredVisibleClubs = useMemo(() => {
    const query = String(clubSearchQuery || "").trim().toLowerCase();

    if (!query) return visibleClubs;

    return visibleClubs.filter((club) => {
      const haystack = [
        club?.name,
        club?.shortName,
        club?.location,
        club?.area,
        club?.weeklyPlayTime,
        club?.schedule?.weeklyPlayTime,
        club?.description,
      ].join(" ").toLowerCase();

      return haystack.includes(query);
    });
  }, [visibleClubs, clubSearchQuery]);

  function normalizeNewClubForHome(club) {
    const fakeDocSnap = {
      id: club.id,
      data: () => club,
    };

    return normalizeClub(fakeDocSnap);
  }

  function isUsersOwnClub(club) {
    const userClubId =
      identity?.clubId ||
      identity?.homeClubId ||
      identity?.activeClubId ||
      "";

    return (
      String(club?.id || club?.clubId || "").trim().toLowerCase() ===
      String(userClubId || "").trim().toLowerCase()
    );
  }

  function openClubActions(club) {
    const missing = getMissingClubRequirements(club);
    const userCanManage = canCurrentUserManageClub(currentUser, club);

    if (missing.length && userCanManage && !isSuperAdmin(currentUser)) {
      setCompletionPromptClub(club);
      return;
    }

    if (isUsersOwnClub(club)) {
      handleViewClub(club);
      return;
    }

    setActiveClub(club);
  }

  function handleViewClub(club) {
    setActiveClub(null);
    setCompletionPromptClub(null);

    if (club?.id === "turf-kings") {
      onEnterTurfKings?.(club);
      return;
    }

    onViewClub?.(club);
  }


  function canCurrentUserSendChallenge() {
    const role = String(identity?.role || identity?.actingRole || identity?.realRole || "").toLowerCase();
    return Boolean(currentUser?.email) && ["admin", "captain"].includes(role);
  }

  function openChallengeRequest(club) {
    setActiveClub(null);
    setActiveMapClub(null);
    setChallengeClub(club);
    setChallengeFormat("5v5");
    setChallengeDate("");
    setChallengeKickoff("19:00");
    setChallengeMessage("");
    setChallengeStatus("");
    setChallengeError("");
  }

  async function handleDeleteClub(club) {
    const clubId = String(club?.id || club?.clubId || "").trim();

    if (!isSuperAdmin(currentUser)) {
      window.alert("Only the super admin can delete clubs.");
      return;
    }

    if (!clubId) {
      window.alert("Could not identify this club.");
      return;
    }

    const clubName = club?.name || clubId;
    const typed = window.prompt(
      `Type DELETE to remove ${clubName} from the public hub. This will hide the club but keep a record for audit purposes.`
    );

    if (typed !== "DELETE") return;

    try {
      setDeletingClubId(clubId);

      await updateDoc(doc(db, "clubs", clubId), {
        status: "deleted",
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedByEmail: currentUser?.email || "",
        deletedByUid: currentUser?.uid || "",
      });

      setClubs((current) => {
        const next = current.filter((item) => String(item?.id || item?.clubId || "") !== clubId);

        try {
          window.localStorage.setItem(CLUB_CACHE_KEY, JSON.stringify(next));
        } catch {
          // Ignore cache failures.
        }

        return next;
      });

      setActiveClub(null);
      setActiveMapClub(null);
    } catch (error) {
      console.error("[HomePage_HUB] Could not delete club:", error);
      window.alert("Could not delete this club. Please try again.");
    } finally {
      setDeletingClubId("");
    }
  }

  async function submitChallengeRequest() {
    setChallengeError("");
    setChallengeStatus("");

    if (!canCurrentUserSendChallenge()) {
      setChallengeError("Only a signed-in club admin or captain can send a challenge.");
      return;
    }

    if (!identity?.clubId) {
      setChallengeError("Open your own club first before sending challenges.");
      return;
    }

    if (!challengeClub?.id) {
      setChallengeError("Select a club to challenge.");
      return;
    }

    if (!challengeDate) {
      setChallengeError("Please suggest a match date.");
      return;
    }

    try {
      setIsSubmittingChallenge(true);

      const payload = {
        challengerClubId: identity.clubId,
        challengerClubName: identity.clubName || identity.clubShortName || "Challenger club",

        challengerClubLogo:
          identity?.logoUrl ||
          identity?.clubLogoUrl ||
          identity?.image ||
          "",

        challengerAdminEmail: currentUser?.email || identity?.email || "",
        challengerAdminName: identity?.shortName || identity?.fullName || currentUser?.displayName || "Club admin",

        targetClubId: challengeClub.id,
        targetClubName: challengeClub.name || "Target club",

        targetClubLogo:
          challengeClub?.logoUrl ||
          challengeClub?.image ||
          "",

        format: challengeFormat,
        proposedDate: challengeDate,
        proposedKickoff: challengeKickoff,
        message: challengeMessage.trim(),

        status: "pending",
        createdAt: serverTimestamp(),
        createdAtMs: Date.now(),
      };

      await addDoc(collection(db, "clubs", challengeClub.id, "incomingChallenges"), payload);
      await addDoc(collection(db, "clubChallenges"), payload);

      setChallengeStatus("Challenge sent. The other club admin can review it once incoming challenges are connected.");
      setChallengeMessage("");
    } catch (error) {
      console.error("[HomePage_HUB] Challenge request failed:", error);
      setChallengeError("Could not send the challenge request. Please try again.");
    } finally {
      setIsSubmittingChallenge(false);
    }
  }


  function handleJoinExistingClub(club = null) {
    setSignupOpen(false);
    setActiveClub(null);
    setCompletionPromptClub(null);

    if (club) {
      onJoinClub?.(club);
    }

    if (typeof onNavigateToEntryPage === "function") {
      onNavigateToEntryPage({ club, intent: "join-club" });
      return;
    }

    if (club?.id === "turf-kings") {
      onEnterTurfKings?.(club);
      return;
    }

    onFindClub?.();
  }

  function handleClubCreated(club) {
    onRegisterClub?.(club);

    setClubs((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== club.id);
      return [...withoutDuplicate, normalizeNewClubForHome(club)];
    });
  }

  function handleClubUpdated(updatedClub) {
    setClubs((current) =>
      current.map((club) =>
        club.id === updatedClub.id
          ? normalizeNewClubForHome({ ...club, ...updatedClub })
          : club
      )
    );

    setActiveClub((current) =>
      current?.id === updatedClub.id
        ? normalizeNewClubForHome({ ...current, ...updatedClub })
        : current
    );
  }

  const completionMissingItems = completionPromptClub
    ? getMissingClubRequirements(completionPromptClub)
    : [];

  const selectedMapClub = activeMapClub || null;


  useEffect(() => {
    let cancelled = false;

    async function loadClubFeaturedVideos() {
      if (!visibleClubs?.length) return;

      const entries = await Promise.all(
        visibleClubs.map(async (club) => {
          const clubId = club?.id || club?.clubId || club?.slug;

          if (!clubId) return ["", null];

          try {
            const highlight = await getClubFeaturedHighlight(clubId);
            const url =
              highlight?.downloadUrl ||
              highlight?.videoUrl ||
              highlight?.mediaUrl ||
              highlight?.fileUrl ||
              highlight?.publicUrl ||
              highlight?.previewUrl ||
              highlight?.url ||
              highlight?.uri ||
              "";

            return [clubId, url || null];
          } catch (error) {
            console.warn("[TK HOME HUB] Could not load featured video:", clubId, error);
            return [clubId, null];
          }
        })
      );

      if (!cancelled) {
        setClubFeaturedVideos(Object.fromEntries(entries.filter(([clubId]) => clubId)));
      }
    }

    loadClubFeaturedVideos();

    return () => {
      cancelled = true;
    };
  }, [visibleClubs]);

  const footerLogoRotation = useMemo(() => {
    const logos = [
      { src: HOME_FOOTER_LOGO_LIGHT, label: "light" },
      { src: HOME_FOOTER_LOGO_DAY, label: "day" },
      { src: HOME_FOOTER_LOGO_DARK, label: "night" },
    ];

    return [...logos].sort(() => Math.random() - 0.5);
  }, []);

  return (
    <main className="homepage-hub-shell homepage-hub-shell--clubs-first">
      <header className="hub-topbar">
        <button
          type="button"
          className="hub-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <span>
            <img
              src={HOME_TOP_LOGO}
              alt=""
              onError={(event) => {
                event.currentTarget.src = HOME_FALLBACK_LOGO;
              }}
            />
          </span>
          <strong>5 Asides Near Me</strong>
        </button>

        <nav className="hub-nav">
          {currentUser ? (
            <>
              <span
                className="hub-user-avatar"
                title={currentUser?.displayName || currentUser?.email || "Signed in"}
                aria-label={currentUser?.displayName || currentUser?.email || "Signed in"}
              >
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <strong>
                    {String(currentUser?.displayName || currentUser?.email || "U")
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </strong>
                )}
              </span>

              <button
                type="button"
                className="hub-nav__primary"
                onClick={() => {
                  console.log("[HomePage_HUB] New Challenge clicked");
                }}
              >
                New Challenge
              </button>
            </>
          ) : (
            <button
              type="button"
              className="hub-nav__primary"
              onClick={() => setSignupOpen(true)}
            >
              Sign up free
            </button>
          )}
        </nav>
      </header>

      <section className="hub-clubs-section hub-clubs-section--hero" id="hub-clubs">
        <div className="hub-section-head hub-section-head--clubs-first">
          <div>
            <span className="hub-kicker">Discover clubs near you</span>
          </div>
        </div>

        <div className="hub-club-filter-ribbon">
          <div className="hub-club-filter-ribbon__scroll">
            <button
              type="button"
              className="hub-club-filter-ribbon__pill hub-club-filter-ribbon__pill--active"
            >
              All
            </button>

            <button
              type="button"
              className="hub-club-filter-ribbon__pill"
            >
              My clubs
            </button>

            <button
              type="button"
              className="hub-club-filter-ribbon__pill"
            >
              Nearby
            </button>

            <button
              type="button"
              className="hub-club-filter-ribbon__pill"
            >
              New
            </button>
          </div>

          <button
            type="button"
            className="hub-club-filter-ribbon__search"
          >
            Search 🔎
          </button>
        </div>

        {loadingClubs && !clubs.length ? (
          <div className="hub-loading-card">Loading clubs...</div>
        ) : null}

        <div className="hub-club-carousel" aria-label="Club carousel">
          <button
            type="button"
            className="hub-register-card"
            onClick={() => setSignupOpen(true)}
          >
            <span>+</span>
            <strong>Register your club</strong>
            <small>Free setup for captains</small>
          </button>

          {visibleClubs.map((club) => {
            const clubId = club?.id || club?.clubId || club?.slug;
            const featuredVideoUrl = clubFeaturedVideos[clubId] || "";

            return (
              <HomePage_HUB_ClubCard
                key={club.id}
                club={{
                  ...club,
                  featuredVideoUrl,
                }}
                onOpenClubActions={openClubActions}
              />
            );
          })}
        </div>
      </section>

      <section className="hub-map-section" aria-label="Club map preview">
        <div className="hub-map-copy">
          <span className="hub-kicker">Find football around you</span>
          <h2>Locate clubs on the map</h2>
          <p>
            As more clubs join, players can quickly spot nearby match nights and
            choose where to play.
          </p>
        </div>

        <div className="hub-map-card">
          <div className="hub-map-surface hub-map-surface--leaflet">
            <MapContainer
              center={[-33.9608, 18.4860]}
              zoom={10}
              scrollWheelZoom={false}
              className="hub-leaflet-map"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {visibleClubs.map((club) => {
                const point = getClubLatLng(club);
                if (!point) return null;

                return (
                  <Marker
                    key={club.id}
                    position={[point.latitude, point.longitude]}
                    icon={L.divIcon({
                      className: "hub-leaflet-marker",
                      html: `
                        <div class="hub-leaflet-marker-inner">
                          <img src="${club.logoUrl || HOME_FALLBACK_LOGO}" />
                        </div>
                      `,
                      iconSize: [52, 52],
                      iconAnchor: [26, 52],
                      popupAnchor: [0, -42],
                    })}
                    eventHandlers={{
                      click: () => setActiveMapClub(club),
                    }}
                  >
                    
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
          {selectedMapClub ? (
            <aside className="hub-map-selected-card hub-map-selected-card--floating" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="hub-map-selected-card__close"
                onClick={(event) => { event.stopPropagation(); setActiveMapClub(null); }}
                aria-label="Close selected club"
              >
                ×
              </button>

              <span className="hub-map-selected-card__kicker">Selected club</span>
              <strong>{selectedMapClub.name}</strong>
              <small>📍 {selectedMapClub.location}</small>
              <small>🕒 {selectedMapClub.weeklyPlayTime}</small>
              <p>{selectedMapClub.description}</p>

              <div className="hub-map-selected-card__actions">
                <button type="button" onClick={() => handleViewClub(selectedMapClub)}>
                  Open club
                </button>
                <button type="button" onClick={() => handleJoinExistingClub(selectedMapClub)}>
                  Join
                </button>
                <button type="button" onClick={() => openChallengeRequest(selectedMapClub)}>
                  Challenge
                </button>
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      <footer className="hub-footer-brand">
        <div className="hub-footer-logo-stage">
          {footerLogoRotation.map((logo, index) => (
            <img
              key={logo.label}
              src={logo.src}
              alt="5 Asides Near Me"
              className={`hub-footer-logo-static hub-footer-logo-static--${["one", "two", "three"][index]}`}
              onError={(event) => {
                event.currentTarget.src = HOME_TOP_LOGO;
              }}
            />
          ))}
        </div>

        <section>
          <span className="hub-kicker">Club-first football</span>
          <h2>Find football. Play today.</h2>
          <p>
            5 Asides Near Me connects players, captains, payments, highlights
            and club discovery in one clean football platform.
          </p>
          <div className="hub-footer-actions">
            <button
              type="button"
              className="hub-footer-tour-button"
              onClick={() => setShowTour(true)}
            >
              Take the tour
            </button>
          </div>

        </section>

        <div className="hub-premium-footer-panels" aria-label="5 Asides Near Me support, FAQs and quick links">
          <section className="hub-premium-footer-card">
            <h3>Need help? <span>🎧</span></h3>

            <a className="hub-premium-footer-row" href="mailto:support@5asidesnearme.com">
              <span className="hub-premium-footer-icon">✉️</span>
              <span>
                <strong>Email us</strong>
                <small>support@5asidesnearme.com</small>
              </span>
              <em>›</em>
            </a>

            <a className="hub-premium-footer-row" href="https://wa.me/27762849740" target="_blank" rel="noreferrer">
              <span className="hub-premium-footer-icon">💬</span>
              <span>
                <strong>Chat on WhatsApp</strong>
                <small>We’re here to help</small>
              </span>
              <em>›</em>
            </a>

            <div className="hub-premium-footer-row hub-premium-footer-row--static">
              <span className="hub-premium-footer-icon">🕒</span>
              <span>
                <strong>Support hours</strong>
                <small>Mon–Fri: 08:00–18:00 SAST</small>
              </span>
            </div>
          </section>

          <section className="hub-premium-footer-card">
            <h3>FAQs <span>❔</span></h3>
            <button type="button" className="hub-premium-footer-row" onClick={() => openHubInfoModal("joinClub")}>
              <span><strong>How do I join a club?</strong></span>
              <em>›</em>
            </button>
            <button type="button" className="hub-premium-footer-row" onClick={() => openHubInfoModal("payments")}>
              <span><strong>How do payments work?</strong></span>
              <em>›</em>
            </button>
            <button type="button" className="hub-premium-footer-row" onClick={() => openHubInfoModal("challengeClub")}>
              <span><strong>How do I challenge another club?</strong></span>
              <em>›</em>
            </button>
            <button type="button" className="hub-premium-footer-view-all" onClick={() => openHubInfoModal("joinClub")}>
              View FAQs <span>›</span>
            </button>
          </section>

          <section className="hub-premium-footer-card">
            <h3>Quick links <span>🔗</span></h3>
            <button type="button" className="hub-premium-footer-row">
              <span className="hub-premium-footer-icon">👥</span>
              <span><strong>About 5 Asides Near Me</strong></span>
              <em>›</em>
            </button>
            <button type="button" className="hub-premium-footer-row" onClick={() => openHubInfoModal("terms")}>
              <span className="hub-premium-footer-icon">📄</span>
              <span><strong>Terms & Privacy</strong></span>
              <em>›</em>
            </button>
            <button type="button" className="hub-premium-footer-row" onClick={() => openHubContactModal("feedback")}>
              <span className="hub-premium-footer-icon">💬</span>
              <span><strong>Send feedback</strong></span>
              <em>›</em>
            </button>
          </section>
        </div>

        <details className="hub-mobile-help-accordion">
          <summary>Help? <span>🎧</span></summary>

          <details className="hub-mobile-help-group">
            <summary>✉️ Need help?</summary>
            <a href="mailto:support@5asidesnearme.com">Email support</a>
            <a href="https://wa.me/27762849740" target="_blank" rel="noreferrer">Chat on WhatsApp</a>
            <span>Mon–Fri: 08:00–18:00 SAST</span>
          </details>

          <details className="hub-mobile-help-group">
            <summary>❔ FAQs</summary>
            <button type="button" onClick={() => openHubInfoModal("joinClub")}>How do I join a club?</button>
            <button type="button" onClick={() => openHubInfoModal("payments")}>How do payments work?</button>
            <button type="button" onClick={() => openHubInfoModal("challengeClub")}>How do I challenge another club?</button>
          </details>

          <details className="hub-mobile-help-group">
            <summary>🔗 Quick links</summary>
            <button type="button">About 5 Asides Near Me</button>
            <button type="button" onClick={() => openHubInfoModal("terms")}>Terms & Privacy</button>
            <button type="button" onClick={() => openHubContactModal("feedback")}>Send feedback</button>
          </details>
        </details>

      </footer>


      {hubInfoModal ? (
        <div className="hub-action-sheet-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setHubInfoModal(null);
        }}>
          <section className="hub-info-modal" aria-label={hubInfoModal.title}>
            <button type="button" className="hub-action-sheet__close" onClick={() => setHubInfoModal(null)}>
              ×
            </button>
            <span className="hub-kicker">5 Asides Near Me</span>
            <h2>{hubInfoModal.title}</h2>
            <div className="hub-info-modal__body">
              {hubInfoModal.body.map((item, index) => (
                <p key={index}>{item}</p>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {hubContactModal ? (
        <div className="hub-action-sheet-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setHubContactModal(null);
        }}>
          <section className="hub-info-modal" aria-label="Contact 5 Asides Near Me">
            <button type="button" className="hub-action-sheet__close" onClick={() => setHubContactModal(null)}>
              ×
            </button>
            <span className="hub-kicker">{hubContactModal === "feedback" ? "Feedback" : "Support"}</span>
            <h2>{hubContactModal === "feedback" ? "Send feedback" : "Email us"}</h2>

            <label className="hub-contact-field">
              <span>Subject</span>
              <input value={hubContactSubject} onChange={(event) => setHubContactSubject(event.target.value)} />
            </label>

            <label className="hub-contact-field">
              <span>Message</span>
              <textarea value={hubContactMessage} onChange={(event) => setHubContactMessage(event.target.value)} rows={6} placeholder="Write your message here..." />
            </label>

            <button type="button" className="hub-primary-button" onClick={sendHubContactMessage}>
              Open Gmail to send
            </button>
          </section>
        </div>
      ) : null}

      {completionPromptClub ? (
        <div
          className="hub-action-sheet-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCompletionPromptClub(null);
          }}
        >
          <section
            className="hub-action-sheet"
            aria-label={`${completionPromptClub.name} setup reminder`}
          >
            <button
              type="button"
              className="hub-action-sheet__close"
              onClick={() => setCompletionPromptClub(null)}
            >
              ×
            </button>

            <span className="hub-kicker">Club setup reminder</span>
            <h2>{completionPromptClub.name} is not fully ready yet</h2>

            <p
              style={{
                color: "#64748b",
                fontWeight: 750,
                lineHeight: 1.5,
                marginTop: "14px",
              }}
            >
              Complete the items below so players can identify the club quickly
              and the platform can map and route payments properly.
            </p>

            <ul
              style={{
                display: "grid",
                gap: "10px",
                padding: 0,
                margin: "18px 0 0",
                listStyle: "none",
              }}
            >
              {completionMissingItems.map((item) => (
                <li
                  key={item}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "16px",
                    background: "#f8fafc",
                    border: "1px solid rgba(15, 23, 42, 0.10)",
                    color: "#06152b",
                    fontWeight: 900,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>

            <div className="hub-action-sheet__buttons">
              <button
                type="button"
                onClick={() => {
                  setProfileEditorClub(completionPromptClub);
                  setCompletionPromptClub(null);
                }}
              >
                Update info
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveClub(completionPromptClub);
                  setCompletionPromptClub(null);
                }}
              >
                Continue
              </button>

              <button
                type="button"
                onClick={() => {
                  const club = completionPromptClub;
                  setCompletionPromptClub(null);
                  handleViewClub(club);
                }}
              >
                Open club
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeClub ? (
        <div
          className="hub-action-sheet-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveClub(null);
          }}
        >
          <section
            className="hub-action-sheet"
            aria-label={`${activeClub.name} actions`}
          >
            <button
              type="button"
              className="hub-action-sheet__close"
              onClick={() => setActiveClub(null)}
            >
              ×
            </button>

            <span className="hub-kicker hub-action-sheet__club-badge">{activeClub.name}</span>
            <h2>What would you like to do?</h2>

            <div className="hub-action-sheet__buttons">
              <button type="button" onClick={() => handleViewClub(activeClub)}>
                View Club
              </button>

              <button
                type="button"
                onClick={() => handleJoinExistingClub(activeClub)}
              >
                Join
              </button>

              <button
                type="button"
                onClick={() => {
                  openChallengeRequest(activeClub);
                }}
              >
                Challenge
              </button>

              {isSuperAdmin(currentUser) ? (
                <button
                  type="button"
                  className="hub-danger-button"
                  disabled={deletingClubId === String(activeClub?.id || activeClub?.clubId || "")}
                  onClick={() => handleDeleteClub(activeClub)}
                >
                  {deletingClubId === String(activeClub?.id || activeClub?.clubId || "") ? "Deleting..." : "Delete Club"}
                </button>
              ) : null}

              {canCurrentUserManageClub(currentUser, activeClub) ? (
                <button
                  type="button"
                  onClick={() => {
                    setProfileEditorClub(activeClub);
                    setActiveClub(null);
                  }}
                >
                  Edit Club
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}


      {challengeClub ? (
        <div
          className="hub-challenge-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setChallengeClub(null);
          }}
        >
          <section className="hub-challenge-modal" aria-label={`Challenge ${challengeClub.name}`}>
            <button
              type="button"
              className="hub-challenge-modal__close"
              onClick={() => setChallengeClub(null)}
            >
              ×
            </button>

            <span className="hub-challenge-modal__kicker">Club challenge</span>
            <h2>Challenge {challengeClub.name}</h2>
            <p className="hub-challenge-modal__intro">
              Send a formal challenge request. Match signup and payments will only be created after both clubs agree.
            </p>

            <div className="hub-challenge-format-grid">
              {[
                ["5v5", "5-a-side"],
                ["6v6", "6-a-side"],
                ["7v7", "7-a-side"],
                ["11v11", "11-a-side"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={challengeFormat === value ? "is-selected" : ""}
                  onClick={() => setChallengeFormat(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="hub-challenge-form-grid">
              <label>
                <span>Suggested date</span>
                <input
                  type="date"
                  value={challengeDate}
                  onChange={(event) => setChallengeDate(event.target.value)}
                />
              </label>

              <label>
                <span>Kickoff</span>
                <input
                  type="time"
                  value={challengeKickoff}
                  onChange={(event) => setChallengeKickoff(event.target.value)}
                />
              </label>

              <label className="hub-challenge-form-grid__wide">
                <span>Message</span>
                <textarea
                  rows="4"
                  value={challengeMessage}
                  onChange={(event) => setChallengeMessage(event.target.value)}
                  placeholder="Example: We are available next Friday evening. Let us know if this works."
                />
              </label>
            </div>

            {challengeError ? <p className="hub-challenge-error">{challengeError}</p> : null}
            {challengeStatus ? <p className="hub-challenge-success">{challengeStatus}</p> : null}

            <div className="hub-challenge-actions">
              <button type="button" onClick={() => setChallengeClub(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submitChallengeRequest}
                disabled={isSubmittingChallenge}
              >
                {isSubmittingChallenge ? "Sending..." : "Send challenge"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <HomePage_HUB_SignupModal
        isOpen={signupOpen}
        onClose={() => setSignupOpen(false)}
        onJoinExistingClub={() => handleJoinExistingClub(null)}
        onClubCreated={handleClubCreated}
      />

      <HomePage_HUB_ClubProfileEditorModal
        isOpen={Boolean(profileEditorClub)}
        club={profileEditorClub}
        onClose={() => setProfileEditorClub(null)}
        onSaved={handleClubUpdated}
      />
    
      {showTour ? (
        <div className="hub-tour-modal-backdrop" onClick={() => setShowTour(false)}>
          <section className="hub-tour-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="hub-tour-modal-close"
              onClick={() => setShowTour(false)}
              aria-label="Close tour"
            >
              ×
            </button>

            <p className="hub-tour-modal-kicker">Choose your guide</p>
            <h2>Start with the right tour</h2>

            <div className="hub-tour-video-grid">
              <button
                type="button"
                className="hub-tour-video-card"
                onClick={() => window.open("/club-leader-tour", "_self")}
              >
                <span>Club leader guide</span>
                <small>Set up clubs, payments, players and match flow.</small>
              </button>

              <button
                type="button"
                className="hub-tour-video-card"
                onClick={() => window.open("/player-tour", "_self")}
              >
                <span>Player guide</span>
                <small>Find clubs, sign up, play and follow highlights.</small>
              </button>
            </div>
          </section>
        </div>
      ) : null}

    </main>
  );
}
