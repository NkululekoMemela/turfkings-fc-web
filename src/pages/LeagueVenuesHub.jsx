import React, {
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import VenueRegistrationModal from "../components/VenueRegistrationModal.jsx";
import VenueMarketingFooter from "../components/VenueMarketingFooter.jsx";
import VenueCarouselCard from "../components/VenueCarouselCard.jsx";
import {
  watchLeagueVenues,
} from "../storage/leagueVenueRepository.js";
import "../styles/HomePage_HUB.css";
import "./WelcomePage.css";
import "./LeagueVenuesHub.css";

export default function LeagueVenuesHub({
  onBack,
  onViewVenue,
}) {
  const {
    authUser,
    signInWithGoogle,
  } = useAuth();

  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [
    registrationOpen,
    setRegistrationOpen,
  ] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [fieldTheme] = useState(() => {
    try {
      return (["dark", "pearl", "sandstone"].includes(localStorage.getItem("field-theme")) ? localStorage.getItem("field-theme") : "dark");
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    return watchLeagueVenues(
      (items) => {
        setVenues(items);
        setLoading(false);
        setLoadError("");
      },
      (error) => {
        setLoading(false);
        setLoadError(
          error?.code === "permission-denied"
            ? "Fields will appear here when registration opens."
            : "Fields could not be loaded right now."
        );
      }
    );
  }, []);

  const visibleVenues = useMemo(() => {
    const search =
      query.trim().toLowerCase();

    return venues.filter((venue) => {
      if (
        view === "mine" &&
        venue.ownerUid !== authUser?.uid
      ) {
        return false;
      }

      const searchable = [
        venue.name,
        venue.location?.suburb,
        venue.location?.city,
        venue.location?.province,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        !search ||
        searchable.includes(search)
      );
    });
  }, [
    venues,
    query,
    view,
    authUser?.uid,
  ]);

  function openRegistration() {
    setRegistrationOpen(true);
  }

  function handleVenueCreated(venue) {
    setRegistrationOpen(false);
    onViewVenue?.(venue);
  }

  return createPortal(
    <main className="fanm-venues fanm-venues--live" data-field-theme={fieldTheme}>
      <div className="fanm-venues__shell">
        <header className="hub-topbar">
          <button
            type="button"
            className="hub-brand"
            onClick={(event) =>
              event.currentTarget.closest("main")?.scrollTo({
                top: 0, behavior: "smooth",
              })
            }
          >
            <span>
              <img
                src="/HomePage_Hub/5_AsidesNearMe_light_logo.png"
                alt=""
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = "/HomePage/Logo_icon.jpeg";
                }}
              />
            </span>
            <strong>5 Asides Near Me</strong>
          </button>

          <nav className="hub-nav" aria-label="Field account">
            {authUser ? (
              <span
                className="hub-user-avatar"
                title={authUser.displayName || "Signed in"}
                aria-label={authUser.displayName || "Signed in"}
              >
                {authUser.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <strong>
                    {(authUser.displayName || "U").trim().charAt(0).toUpperCase()}
                  </strong>
                )}
              </span>
            ) : (
              <button
                type="button"
                className="hub-nav__primary"
                onClick={openRegistration}
              >
                Sign up free
              </button>
            )}
          </nav>
        </header>

        <section className="fanm-venues__panel">
          <div className="fanm-venues__intro">
            <div className="fanm-venues__discovery-row">
              <span className="hub-kicker">
                DISCOVER 5 ASIDE FIELDS NEAR YOU
              </span>
              <button
                type="button"
                className="fanm-venues__welcome-return"
                onClick={onBack}
                aria-label="Back to welcome"
                title="Back to welcome"
              >
                ↶
              </button>
            </div>
            <h1>Fields & League Venues</h1>
            <p>
              Find a Field, enter its league
              and follow the matchday.
            </p>
          </div>

          <div className="hub-club-filter-ribbon">
            <div
              className="hub-club-filter-ribbon__scroll"
              role="group"
              aria-label="Field views"
            >
              <button
                type="button"
                className={`hub-club-filter-ribbon__pill ${view === "all" ? "hub-club-filter-ribbon__pill--active" : ""}`}
                aria-pressed={view === "all"}
                onClick={() => setView("all")}
              >
                All Fields
              </button>

              <button
                type="button"
                className={`hub-club-filter-ribbon__pill ${view === "mine" ? "hub-club-filter-ribbon__pill--active" : ""}`}
                aria-pressed={view === "mine"}
                onClick={() => setView("mine")}
              >
                My Fields
              </button>
            </div>

            <label className="hub-club-filter-ribbon__search">
              <input
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search Field, suburb or city"
                aria-label="Search Fields"
              />
              <span aria-hidden="true">🔎</span>
            </label>
          </div>

          {loading ? (
            <p role="status">
              Loading Fields...
            </p>
          ) : null}

          {loadError ? (
            <p
              role="alert"
              className="fanm-venues__error"
            >
              {loadError}
            </p>
          ) : null}

          <div
            className="fanm-venues__carousel"
            aria-label="5-a-side Field carousel"
          >
            <button
              type="button"
              className="fanm-venues__register-card"
              onClick={openRegistration}
            >
              <span className="fanm-venues__plus">
                +
              </span>

              <strong>
                Register your<br />field
              </strong>

              <small>
                Free setup for<br />field managers
              </small>
            </button>

            {visibleVenues.map((venue) => (
              <VenueCarouselCard
                key={venue.id}
                venue={venue}
                onEnter={onViewVenue}
              />
            ))}

            {!loading &&
            !loadError &&
            visibleVenues.length === 0 ? (
              <div className="fanm-venues__empty">
                {query || view === "mine"
                  ? "No Fields match this view yet."
                  : "Fields will appear here as managers register."}
              </div>
            ) : null}
          </div>
        </section>

        <VenueMarketingFooter />

        {registrationOpen &&
        !authUser ? (
          <div
            className="fanm-venues__overlay"
            role="presentation"
            onClick={() =>
              setRegistrationOpen(false)
            }
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="field-signin-title"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <button
                type="button"
                className="fanm-venues__close"
                aria-label="Close"
                onClick={() =>
                  setRegistrationOpen(false)
                }
              >
                ×
              </button>

              <span className="fanm-venues__signin-icon">
                🏟️
              </span>

              <h2 id="field-signin-title">
                Register a new 5 Asides
                Field/Venue
              </h2>

              <p>
                Sign in with the Google account
                of the authorised Field
                representative.
              </p>

              <button
                type="button"
                onClick={() =>
                  signInWithGoogle()
                }
              >
                Sign in with Google
              </button>
            </section>
          </div>
        ) : null}

        <VenueRegistrationModal
          isOpen={
            registrationOpen &&
            Boolean(authUser)
          }
          onClose={() =>
            setRegistrationOpen(false)
          }
          onVenueCreated={
            handleVenueCreated
          }
        />
      </div>
    </main>,
    document.body
  );
}
