// src/pages/HomePage_HUB.jsx

import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import "../styles/HomePage_HUB.css";
import HomePage_HUB_ClubCard from "../components/HomePage_HUB/HomePage_HUB_ClubCard.jsx";
import HomePage_HUB_SignupModal from "../components/HomePage_HUB/HomePage_HUB_SignupModal.jsx";

const HOME_TOP_LOGO = "/HomePage_Hub/5_AsidesNearMe_light_logo.png";
const HOME_FOOTER_LOGO = "/HomePage_Hub/5_AsidesNearMe_Transparent.png";
const HOME_FALLBACK_LOGO = "/HomePage/Logo_icon.jpeg";

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

function getMapPinStyle(index, total) {
  const presets = [
    { left: "24%", top: "38%" },
    { left: "54%", top: "46%" },
    { left: "72%", top: "32%" },
    { left: "38%", top: "62%" },
    { left: "82%", top: "66%" },
    { left: "15%", top: "67%" },
  ];

  if (presets[index]) return presets[index];

  const safeTotal = Math.max(Number(total || 1), 1);
  const angle = (index / safeTotal) * Math.PI * 2;
  const x = 50 + Math.cos(angle) * 32;
  const y = 50 + Math.sin(angle) * 22;

  return {
    left: `${Math.max(10, Math.min(88, x))}%`,
    top: `${Math.max(18, Math.min(78, y))}%`,
  };
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

function canCurrentUserManageClub(currentUser, club = {}) {
  const email = normalizeEmail(currentUser?.email);
  if (!email) return false;
  return getClubAdminEmails(club).includes(email);
}

export default function HomePage_HUB({
  onEnterTurfKings,
  onViewClub,
  onRegisterClub,
  onFindClub,
  onJoinClub,
  onChallengeClub,
  onNavigateToEntryPage,
}) {
  const [clubs, setClubs] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(true);
  const [signupOpen, setSignupOpen] = useState(false);
  const [activeClub, setActiveClub] = useState(null);
  const [completionPromptClub, setCompletionPromptClub] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

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
        const firebaseClubs = snap.docs.map(normalizeClub);

        if (!cancelled) {
          setClubs(firebaseClubs.length ? firebaseClubs : FALLBACK_CLUBS);
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

  function normalizeNewClubForHome(club) {
    const fakeDocSnap = {
      id: club.id,
      data: () => club,
    };

    return normalizeClub(fakeDocSnap);
  }

  function openClubActions(club) {
    const missing = getMissingClubRequirements(club);
    const userCanManage = canCurrentUserManageClub(currentUser, club);

    if (missing.length && userCanManage) {
      setCompletionPromptClub(club);
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

  function handleJoinExistingClub(club = null) {
    setSignupOpen(false);
    setActiveClub(null);
    setCompletionPromptClub(null);

    if (club) {
      onJoinClub?.(club);
    }

    if (typeof onNavigateToEntryPage === "function") {
      onNavigateToEntryPage(club);
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

  const completionMissingItems = completionPromptClub
    ? getMissingClubRequirements(completionPromptClub)
    : [];

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
          <button
            type="button"
            className="hub-nav__primary"
            onClick={() => setSignupOpen(true)}
          >
            Sign up free
          </button>
        </nav>
      </header>

      <section className="hub-clubs-section hub-clubs-section--hero" id="hub-clubs">
        <div className="hub-section-head hub-section-head--clubs-first">
          <div>
            <span className="hub-kicker">Discover clubs near you</span>
            <h1>Swipe through clubs</h1>
          </div>

          <p>
            Each block rotates between the club logo, match details and latest
            highlights.
          </p>
        </div>

        {loadingClubs ? (
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

          {visibleClubs.map((club) => (
            <HomePage_HUB_ClubCard
              key={club.id}
              club={club}
              onOpenClubActions={openClubActions}
            />
          ))}
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
          <div className="hub-map-surface">
            <span className="hub-map-road hub-map-road--one" />
            <span className="hub-map-road hub-map-road--two" />
            <span className="hub-map-road hub-map-road--three" />

            {visibleClubs.slice(0, 8).map((club, index) => (
              <button
                type="button"
                key={club.id}
                className="hub-map-pin"
                style={{
                  ...getMapPinStyle(index, visibleClubs.length),
                  "--hub-map-accent": club.accent || "#16a34a",
                }}
                onClick={() => openClubActions(club)}
                title={club.name}
              >
                <span>{club.logoText || String(club.name || "FC").slice(0, 2)}</span>
              </button>
            ))}
          </div>

          <div className="hub-map-list">
            {visibleClubs.slice(0, 4).map((club) => (
              <button
                type="button"
                key={club.id}
                onClick={() => openClubActions(club)}
              >
                <strong>{club.name}</strong>
                <span>{club.location}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="hub-footer-brand">
        <div>
          <img
            src={HOME_FOOTER_LOGO}
            alt="5 Asides Near Me"
            onError={(event) => {
              event.currentTarget.src = HOME_TOP_LOGO;
            }}
          />
        </div>

        <section>
          <span className="hub-kicker">Club-first football</span>
          <h2>Find football. Play today.</h2>
          <p>
            5 Asides Near Me connects players, captains, payments, highlights
            and club discovery in one clean football platform.
          </p>
          <button type="button" onClick={() => setSignupOpen(true)}>
            Sign up free
          </button>
        </section>
      </footer>

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
                  setCompletionPromptClub(null);
                  setSignupOpen(true);
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

            <span className="hub-kicker">{activeClub.name}</span>
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
                  setActiveClub(null);
                  onChallengeClub?.(activeClub);
                }}
              >
                Challenge
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
    </main>
  );
}