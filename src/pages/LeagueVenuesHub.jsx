import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import {
  createLeagueVenue,
  watchLeagueVenues,
} from "../storage/leagueVenueRepository.js";
import "./WelcomePage.css";
import "./LeagueVenuesHub.css";

export default function LeagueVenuesHub({ onBack, onViewVenue }) {
  const { authUser, signInWithGoogle } = useAuth();
  const [venues, setVenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [draft, setDraft] = useState({
    name: "", city: "", suburb: "", address: "", websiteUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    return watchLeagueVenues(
      (items) => { setVenues(items); setLoading(false); setLoadError(""); },
      (error) => {
        setLoading(false);
        setLoadError(
          error?.code === "permission-denied"
            ? "League venues will appear here when registration opens."
            : "League venues could not be loaded right now."
        );
      }
    );
  }, []);

  const visibleVenues = useMemo(() => {
    const search = query.trim().toLowerCase();
    return venues.filter((venue) => {
      if (view === "mine" && venue.ownerUid !== authUser?.uid) return false;
      return !search ||
        `${venue.name} ${venue.location?.city || ""} ${venue.location?.suburb || ""}`
          .toLowerCase().includes(search);
    });
  }, [venues, query, view, authUser?.uid]);

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submitVenue(event) {
    event.preventDefault();
    setFormError("");
    try {
      setSaving(true);
      const created = await createLeagueVenue(draft);
      setRegistrationOpen(false);
      setDraft({ name: "", city: "", suburb: "", address: "", websiteUrl: "" });
      onViewVenue?.(created);
    } catch (error) {
      setFormError(error?.message || "Venue registration failed.");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <main className="fanm-venues fanm-venues--live">
      <div className="fanm-venues__shell">
        <header>
          <button type="button" onClick={onBack}>← Welcome</button>
          <strong>5 Asides Near Me</strong>
        </header>

        <section className="fanm-venues__panel">
        <div className="fanm-venues__intro">
          <span>CLUB LEAGUES</span>
          <h1>Explore league venues</h1>
          <p>Where fields bring clubs together.</p>
        </div>

        <div className="fanm-venues__tools">
          <div role="group" aria-label="Venue views">
            <button type="button" aria-pressed={view === "all"}
              onClick={() => setView("all")}>All venues</button>
            <button type="button" aria-pressed={view === "mine"}
              onClick={() => setView("mine")}>My venues</button>
          </div>
          <input type="search" value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search venue or city" aria-label="Search league venues" />
        </div>

        {loading && <p role="status">Loading league venues...</p>}
        {loadError && <p role="alert" className="fanm-venues__error">{loadError}</p>}

        <div className="fanm-venues__carousel" aria-label="League venue carousel">
          <button type="button" onClick={() => {
            setFormError("");
            setRegistrationOpen(true);
          }}>
            <span className="fanm-venues__plus">+</span>
            <strong>Register your league venue</strong>
            <small>Setup for field managers</small>
          </button>

          {visibleVenues.map((venue) => (
            <button className="fanm-venues__venue-card" type="button"
              key={venue.id} onClick={() => onViewVenue?.(venue)}>
              <span className="fanm-venues__badge">
                {venue.name.trim().charAt(0).toUpperCase()}
              </span>
              <strong>{venue.name}</strong>
              <small>{[venue.location?.suburb, venue.location?.city]
                .filter(Boolean).join(", ")}</small>
              <span>Tap to enter ↗</span>
            </button>
          ))}

          {!loading && !loadError && visibleVenues.length === 0 && (
            <div className="fanm-venues__empty">
              {query || view === "mine"
                ? "No venues match this view yet."
                : "League venues will appear here as managers register."}
            </div>
          )}
        </div>

        </section>

        {registrationOpen && (
          <div className="fanm-venues__overlay" role="presentation"
            onClick={() => setRegistrationOpen(false)}>
            <section role="dialog" aria-modal="true"
              aria-labelledby="venue-register-title"
              onClick={(event) => event.stopPropagation()}>
              <button type="button" className="fanm-venues__close"
                aria-label="Close" onClick={() => setRegistrationOpen(false)}>×</button>
              <h2 id="venue-register-title">Register a league venue</h2>
              {!authUser ? (
                <>
                  <p>Sign in as the field manager to create your venue.</p>
                  <button type="button" onClick={() => signInWithGoogle()}>
                    Sign in with Google
                  </button>
                </>
              ) : (
                <form onSubmit={submitVenue}>
                  <label>Venue name
                    <input required maxLength={80} value={draft.name}
                      onChange={(e) => updateDraft("name", e.target.value)} />
                  </label>
                  <label>City
                    <input required value={draft.city}
                      onChange={(e) => updateDraft("city", e.target.value)} />
                  </label>
                  <label>Suburb
                    <input value={draft.suburb}
                      onChange={(e) => updateDraft("suburb", e.target.value)} />
                  </label>
                  <label>Street address
                    <input value={draft.address}
                      onChange={(e) => updateDraft("address", e.target.value)} />
                  </label>
                  <label>Existing website (optional)
                    <input type="url" value={draft.websiteUrl}
                      placeholder="https://"
                      onChange={(e) => updateDraft("websiteUrl", e.target.value)} />
                  </label>
                  {formError && <p role="alert" className="fanm-venues__error">{formError}</p>}
                  <button type="submit" disabled={saving}>
                    {saving ? "Creating venue..." : "Create venue"}
                  </button>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </main>,
    document.body
  );
}
