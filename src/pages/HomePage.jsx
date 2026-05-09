// src/pages/HomePage.jsx
import React, { useEffect, useState } from "react";
import "../styles/HomePage.css";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import HomeHero from "../components/home/HomeHero.jsx";
import HomeClubDiscovery from "../components/home/HomeClubDiscovery.jsx";
import HomeClubSignup from "../components/home/HomeClubSignup.jsx";
import HomePlatformFeatures from "../components/home/HomePlatformFeatures.jsx";
import HomeTutorials from "../components/home/HomeTutorials.jsx";
import HomeMapPreview from "../components/home/HomeMapPreview.jsx";

const HOME_LOGO_ICON = "/HomePage/Logo_icon.jpeg";
const HOME_FULL_LOGO = "/HomePage/Full_Logo.jpeg";

export default function HomePage({
  onEnterTurfKings,
  onViewClub,
  onRegisterClub,
  onFindClub,
}) {
  const [theme, setTheme] = useState("balanced");
  const [activeView, setActiveView] = useState("entry");
  const [clubs, setClubs] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadClubs() {
      try {
        const snap = await getDocs(collection(db, "clubs"));
        const firebaseClubs = snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));

        if (!cancelled) {
          setClubs(firebaseClubs);
        }
      } catch (error) {
        console.error("[FANM] Failed to load clubs:", error);
      }
    }

    loadClubs();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleViewClub = (club) => {
    if (club?.id === "turf-kings") {
      onEnterTurfKings?.(club);
      return;
    }

    onViewClub?.(club);
  };

  const handleComingSoon = (message) => {
    window.alert(message || "This feature is planned for the club expansion phase.");
  };

  const scrollToSection = (id) => {
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const showClubs = () => {
    setActiveView("clubs");
    onFindClub?.();
    scrollToSection("clubs");
  };

  const startCaptainFlow = () => {
    setActiveView("captain");
    onRegisterClub?.();
    scrollToSection("register");
  };

  const showFeatures = () => {
    setActiveView("features");
    scrollToSection("features");
  };

  const showBrowse = () => {
    setActiveView("clubs");
    scrollToSection("clubs");
  };

  const showFullHome = activeView === "features";
  const showClubDiscovery = activeView === "clubs" || activeView === "features";
  const showCaptainSignup = activeView === "captain";

  return (
    <main className={`fanm-home-shell fanm-theme-${theme}`}>
      <header className="fanm-topbar">
        <button
          type="button"
          className="fanm-brand"
          onClick={() => {
            setActiveView("entry");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="Back to 5 Asides Near Me homepage top"
        >
          <span className="fanm-brand-mark fanm-brand-mark--image">
            <img src={HOME_LOGO_ICON} alt="" />
          </span>
          <span>
            <strong>5 Asides Near Me</strong>
            <small>Football clubs · players · challenges</small>
          </span>
        </button>

        <nav className="fanm-nav" aria-label="HomePage navigation">
          <button type="button" onClick={showClubs}>Find Clubs</button>
          <button type="button" onClick={startCaptainFlow}>Register</button>
          <button type="button" onClick={showFeatures}>Features</button>
          <button
            type="button"
            className="fanm-theme-toggle"
            onClick={() => setTheme((current) => (current === "balanced" ? "deep" : "balanced"))}
            title="Toggle HomePage theme"
          >
            {theme === "balanced" ? "Deep mode" : "Warm mode"}
          </button>
          <button type="button" className="fanm-nav-primary" onClick={() => onEnterTurfKings?.(clubs.find((club) => club.id === "turf-kings") || null)}>
            Enter Turf Kings
          </button>
        </nav>
      </header>

      <HomeHero
        onCaptainEntry={startCaptainFlow}
        onPlayerEntry={showClubs}
        onBrowse={showBrowse}
      />

      {activeView === "entry" && (
        <section className="fanm-entry-brand-strip" aria-label="5 Asides Near Me brand">
          <div className="fanm-entry-brand-strip__copy">
            <span className="fanm-kicker">Powered by 5 Asides Near Me</span>
            <p>
              A club-first platform for weekly football: find clubs, manage players, collect match fees,
              follow stats and keep the game moving.
            </p>
          </div>
          <div className="fanm-entry-brand-strip__logo">
            <img src={HOME_FULL_LOGO} alt="5 Asides Near Me" />
          </div>
        </section>
      )}

      {showCaptainSignup && (
        <HomeClubSignup
          onClose={() => setActiveView("entry")}
          onClubCreated={(club) => {
            console.log("[FANM] Club created:", club);
            window.alert(`${club.name} created successfully.`);
            setActiveView("clubs");
            scrollToSection("clubs");
          }}
        />
      )}

      {showClubDiscovery && (
        <>
          <HomeClubDiscovery
            clubs={clubs}
            onRegisterClub={startCaptainFlow}
            onViewClub={handleViewClub}
            onJoinClub={(club, meta) => {
              if (meta?.intent === "help-needed") {
                handleComingSoon(`${club.name} needs players. The future flow will let you ping that club admin to join as a guest or request full membership.`);
                return;
              }
              handleComingSoon(`Join request flow for ${club.name} is coming next.`);
            }}
            onChallengeClub={(club) => handleComingSoon(`Club challenges will be reserved for club leaders/admins. ${club.name} challenge flow is coming later.`)}
          />
          <HomeMapPreview clubs={clubs} />
        </>
      )}

      {showFullHome && (
        <>
          <section className="fanm-section fanm-ai-branding">
            <div>
              <span className="fanm-kicker">AI club identity</span>
              <h2>Need a club name or logo?</h2>
              <p>
                Captains can run a WhatsApp poll, upload an existing logo, or later generate a unique football logo
                with a transparent-background version for player cards and club pages.
              </p>
            </div>
            <div className="fanm-ai-actions">
              <button type="button" onClick={() => handleComingSoon("AI club-name suggestions are planned for the club setup wizard.")}>Suggest club names</button>
              <button type="button" onClick={() => handleComingSoon("AI logo generation is planned for the branding setup step.")}>Generate logo with AI</button>
              <button type="button" onClick={() => handleComingSoon("Logo upload will live inside club setup.")}>Upload logo</button>
            </div>
          </section>

          <HomePlatformFeatures />
          <HomeTutorials />

          <section className="fanm-section fanm-brand-showcase" id="brand">
            <div className="fanm-brand-showcase__copy">
              <span className="fanm-kicker">Brand home</span>
              <h2>One identity. Many clubs.</h2>
              <p>
                Turf Kings is the founding club, but 5 Asides Near Me is the platform: searchable clubs,
                player management, payments, stats, highlights, help-needed alerts and future club challenges.
              </p>
              <div className="fanm-brand-showcase__actions">
                <button type="button" onClick={startCaptainFlow}>Start a free club page</button>
                <button type="button" onClick={showClubs}>Browse clubs</button>
              </div>
            </div>

            <div className="fanm-full-logo-card" aria-label="5 Asides Near Me full logo">
              <img src={HOME_FULL_LOGO} alt="5 Asides Near Me" />
            </div>
          </section>

          <section className="fanm-final-cta">
            <span className="fanm-kicker">Ready when you are</span>
            <h2>Make your weekly football night easier to run.</h2>
            <p>
              Captains register for free. Players pay their club through the platform, with a small platform/data fee
              of about R5 per player when signing up for games.
            </p>
            <div>
              <button type="button" onClick={startCaptainFlow}>Register your club for free</button>
              <button type="button" onClick={showClubs}>Find a club near me</button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}