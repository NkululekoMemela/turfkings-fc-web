import { buildClubIdentity } from "../core/clubIdentity.js";
import FiveAsideLoadingPitch from "../components/FiveAsideLoadingPitch.jsx";
import React, { useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import HomePage_HUB_ClubCard from "../components/HomePage_HUB/HomePage_HUB_ClubCard.jsx";
import "../styles/HomePage_HUB.css";
import { createPortal } from "react-dom";
import "./WelcomeHero.css";

function WelcomeIcon({kind}) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "club" ? <>
      <circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3"/>
      <path d="M17 4a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-5.65"/>
    </> : kind === "field" ? <>
      <rect x="3" y="4" width="18" height="16" rx="2"/>
      <path d="M12 4v16M3 9h3v6H3M21 9h-3v6h3"/><circle cx="12" cy="12" r="3"/>
    </> : <>
      <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </>}
  </svg>;
}

export default function WelcomePage({
  onExploreClubs,
  onExploreLeagues,
  onJoinNearbyClub,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerStatus, setPickerStatus] = useState("intro");
  const [loadPhase, setLoadPhase] = useState("location");
  const requestId = useRef(0);
  const [nearbyClubs, setNearbyClubs] = useState([]);
  const [radiusKm, setRadiusKm] = useState(10);
  const [locationAccuracyM, setLocationAccuracyM] = useState(null);
  const [clubsWithoutCoordinates, setClubsWithoutCoordinates] = useState(0);
  const [pickerError, setPickerError] = useState("");

  function closePicker() {
    requestId.current += 1;
    setPickerOpen(false);
    setPickerStatus("intro");
    setPickerError("");
    setNearbyClubs([]);
    setLocationAccuracyM(null);
    setClubsWithoutCoordinates(0);
  }

  async function openNearbyPicker() {
    setPickerOpen(true);
    setPickerError("");

    // A previous grant should go straight to the results.
    try {
      const permission = await navigator.permissions?.query({
        name: "geolocation",
      });
      if (permission?.state === "granted") {
        await findNearbyClubs(true);
        return;
      }
    } catch {
      // Browsers without the Permissions API still use the explanation.
    }
    setPickerStatus("intro");
  }

  async function findNearbyClubs(highAccuracy = false) {
    if (!navigator.geolocation) {
      setPickerError("Location is unavailable in this browser.");
      return;
    }

    const thisRequest = ++requestId.current;
    setPickerStatus("loading");
    setLoadPhase("location");
    setPickerError("");

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 12000 : 7000,
          maximumAge: highAccuracy ? 0 : 600000,
        });
      });

      if (thisRequest !== requestId.current) return;
      setLoadPhase("clubs");
      const snapshot = await getDocs(collection(db, "clubs"));
      if (thisRequest !== requestId.current) return;
      setLocationAccuracyM(position.coords.accuracy);
      const origin = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const radians = (value) => value * Math.PI / 180;

      const clubs = snapshot.docs.flatMap((item) => {
        const data = item.data() || {};
        if (data.deleted === true ||
            String(data.status || "").toLowerCase() === "deleted") {
          return [];
        }

        // Use recorded coordinates only. The hub's suburb placeholders
        // are unsuitable for a strict 10 km search.
        const rawLat = data.locationDetails?.latitude ??
          data.locationDetails?.lat ??
          data.coordinates?.latitude ??
          data.coordinates?.lat ??
          data.latitude;
        const rawLng = data.locationDetails?.longitude ??
          data.locationDetails?.lng ??
          data.locationDetails?.lon ??
          data.coordinates?.longitude ??
          data.coordinates?.lng ??
          data.longitude;
        if (rawLat == null || rawLng == null ||
            rawLat === "" || rawLng === "") return [];

        const latitude = Number(rawLat);
        const longitude = Number(rawLng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];

        const dLat = radians(latitude - origin.latitude);
        const dLng = radians(longitude - origin.longitude);
        const halfChord =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(radians(origin.latitude)) *
          Math.cos(radians(latitude)) *
          Math.sin(dLng / 2) ** 2;
        const distanceKm = 6371 * 2 *
          Math.atan2(Math.sqrt(halfChord), Math.sqrt(1 - halfChord));

        const identity = buildClubIdentity({ ...data, id: item.id });
        return [{
          ...data,
          id: item.id,
          distanceKm,
          image: identity.logoUrl,
          logoUrl: identity.logoUrl,
        }];
      }).sort((left, right) => left.distanceKm - right.distanceKm);

      setClubsWithoutCoordinates(
        snapshot.docs.filter((item) => {
          const data = item.data() || {};
          const lat = data.locationDetails?.latitude ??
            data.locationDetails?.lat ??
            data.coordinates?.latitude ??
            data.coordinates?.lat ??
            data.latitude;
          const lng = data.locationDetails?.longitude ??
            data.locationDetails?.lng ??
            data.locationDetails?.lon ??
            data.coordinates?.longitude ??
            data.coordinates?.lng ??
            data.longitude;
          return lat == null || lng == null || lat === "" || lng === "" ||
            !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng));
        }).length
      );

      // Show the distance cards immediately. Member counts arrive independently.
      setNearbyClubs(clubs.map((club) => ({
        ...club,
        playerCount: club.playerCount ?? "…",
      })));
      setPickerStatus("results");

      clubs.forEach(async (club) => {
        let playerCount = "—";
        try {
          const members = await getDocs(
            collection(db, "clubs", club.id, "members")
          );
          playerCount = members.size;
        } catch (error) {
          console.warn("[Nearby clubs] Member count unavailable", club.id, error);
        }
        if (thisRequest !== requestId.current) return;
        setNearbyClubs((current) => current.map((item) =>
          item.id === club.id ? { ...item, playerCount } : item
        ));
      });
    } catch (error) {
      setPickerStatus("intro");
      setPickerError(
        error?.code === 1
          ? "Location was not allowed. Enable location for this site and try again."
          : "We could not find nearby clubs right now. Please try again."
      );
    }
  }

  return createPortal(
    <main id="fanm-welcome-hero">
      <div className="fanm-hero__content">
        <header className="fanm-hero__header">
          <div className="fanm-hero__brand">
            <img
              src="/pwa/fanm-app-icon.png"
              alt=""
              onError={(event) => { event.currentTarget.style.display = "none"; }}
            />
            <span>5 Asides Near Me</span>
          </div>
          <span className="fanm-hero__edition">FOOTBALL. TOGETHER.</span>
        </header>

        <div className="fanm-hero__main">
          <section className="fanm-hero__story">
            <span className="fanm-hero__eyebrow">
              A home for the five-a-side game
            </span>
            <h1>Futball in<br /><em>This Town</em></h1>
            <p>
              Find your club. Join the football community.
              Make your next match part of something bigger.
            </p>
          </section>

          <nav className="fanm-hero__actions" aria-label="Choose your destination">

            <button type="button" onClick={onExploreClubs}>
              <span className="fanm-hero__action-icon" aria-hidden="true"><WelcomeIcon kind="club"/></span>
              <span className="fanm-hero__action-copy">
                <strong>Clubs</strong>
                <small>Find a team near you or create one.</small>
              </span>
              <span className="fanm-hero__arrow" aria-hidden="true">↗</span>
            </button>
            <button type="button" onClick={onExploreLeagues}>
              <span className="fanm-hero__action-icon" aria-hidden="true"><WelcomeIcon kind="field"/></span>
              <span className="fanm-hero__action-copy">
                <strong>Fields &amp; leagues</strong>
                <small>Explore fields or register and manage your venue.</small>
              </span>
              <span className="fanm-hero__arrow" aria-hidden="true">↗</span>
            </button>
            <button
              className="fanm-hero__join"
              type="button"
              onClick={openNearbyPicker}
            >
              <span className="fanm-hero__action-icon" aria-hidden="true"><img src="/favicon_nobackground.png" alt="" className="fanm-nearby-brand-pin"/></span>
              <span className="fanm-hero__action-copy">
                <strong>Find me a club near me</strong>
                <small>Get matched with a five-a-side club near you.</small>
              </span>
              <span className="fanm-hero__arrow" aria-hidden="true">↗</span>
            </button>
          </nav>
        </div>

        {pickerOpen && (
          <div
            className={`fanm-nearby-backdrop nearby-discovery-screen${pickerStatus === "loading" ? " is-loading" : ""}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closePicker();
            }}
          >
            <section
              className="fanm-nearby-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="fanm-nearby-title"
            >
              <header className="fanm-nearby-header">
                <div>
                  <h2 id="fanm-nearby-title">Clubs near you</h2>
                  <p>Select a club card to open its join form.</p>
                </div>
                <button type="button" onClick={closePicker}
                  aria-label="Close nearby clubs">×</button>
              </header>

              {pickerStatus === "intro" && (
                <div className="fanm-nearby-intro">
                  <p>Allow location to see clubs near you.</p>
                  <button type="button" onClick={() => findNearbyClubs()}>
                    Use my location
                  </button>
                </div>
              )}

              {pickerStatus === "loading" && (
                <div className="fanm-nearby-loading" role="status">
                  <FiveAsideLoadingPitch />
                  <strong>
                    {loadPhase === "location"
                      ? "Finding your position"
                      : "Bringing nearby clubs into view"}
                  </strong>
                  <small>
                    {loadPhase === "location"
                      ? "Using a recent location when available"
                      : "Club cards will appear before player counts finish loading"}
                  </small>
                </div>
              )}
              {pickerError && <p role="alert">{pickerError}</p>}

              {pickerStatus === "results" && (
                <>
                  <div className="fanm-nearby-controls">
                    <label htmlFor="fanm-nearby-radius">
                      Radius from your location: <strong>{radiusKm} km</strong>
                    </label>
                    <input
                      id="fanm-nearby-radius"
                      type="range"
                      min="1"
                      max="25"
                      step="1"
                      value={radiusKm}
                      onChange={(event) =>
                        setRadiusKm(Number(event.target.value))
                      }
                    />
                    {clubsWithoutCoordinates > 0 && (
                      <small>
                        {clubsWithoutCoordinates} club
                        {clubsWithoutCoordinates === 1 ? "" : "s"} without
                        a recorded venue position
                      </small>
                    )}
                    {Number.isFinite(locationAccuracyM) &&
                      locationAccuracyM > radiusKm * 1000 && (
                        <div className="fanm-nearby-accuracy-warning">
                          <span>
                            This device cannot pinpoint your location.
                            Nearby results may be incomplete. Try precise
                            location on your phone.
                          </span>
                          <button
                            type="button"
                            onClick={() => findNearbyClubs(true)}
                          >
                            Retry precise location
                          </button>
                        </div>
                      )}
                  </div>
                  {nearbyClubs.some((club) => club.distanceKm <= radiusKm) ? (
                  <div
                    className="fanm-nearby-grid"
                    aria-label="Nearby clubs; scroll sideways for more"
                  >
                    {Array.from({
                      length: Math.ceil(
                        nearbyClubs.filter(
                          (club) => club.distanceKm <= radiusKm
                        ).length / 4
                      ),
                    }, (_, pageIndex) => (
                      <div className="fanm-nearby-grid__page" key={pageIndex}>
                        {nearbyClubs
                          .filter((club) => club.distanceKm <= radiusKm)
                          .slice(pageIndex * 4, pageIndex * 4 + 4)
                          .map((club) => (
                            <HomePage_HUB_ClubCard
                              key={club.id}
                              club={{
                                ...club,
                                distanceUncertain:
                                  !Number.isFinite(locationAccuracyM) ||
                                  locationAccuracyM > 1000,
                              }}
                              initialFace={1}
                              faceCount={2}
                              canJoin={false}
                              onViewClub={() => {
                                closePicker();
                                onJoinNearbyClub?.(club);
                              }}
                            />
                          ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>No clubs with a recorded venue position are within {radiusKm} km. Increase the radius to look farther away.</p>
                )}
                </>
              )}
            </section>
          </div>
        )}

        <footer className="fanm-hero__footer">
          <span>PLAY LOCAL. BELONG EVERYWHERE.</span>
          <span>Players · Clubs · Field managers</span>
        </footer>
      </div>
    </main>,
    document.body
  );
}
