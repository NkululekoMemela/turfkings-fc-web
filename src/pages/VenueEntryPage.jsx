import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig.js";
import { useAuth } from "../auth/AuthContext.jsx";
import VenueLandingPage from "./VenueLandingPage.jsx";
import { createPortal } from "react-dom";
import "./VenueEntryPage.css";

function authorizedClubAdmin(club, user) {
  if (!club || !user?.uid) return false;
  const uids = [
    club.createdByUid, club.ownerUid,
    ...(Array.isArray(club.adminUids) ? club.adminUids : []),
  ];
  const emails = [
    club.createdByEmail, club.adminEmail,
    ...(Array.isArray(club.adminEmails) ? club.adminEmails : []),
  ];
  const email = String(user.email || "").trim().toLowerCase();
  return uids.includes(user.uid) ||
    (email && emails.some((value) =>
      String(value || "").trim().toLowerCase() === email));
}

export default function VenueEntryPage({ venue, onBack }) {
  const { authUser, signInWithGoogle } = useAuth();
  const [role, setRole] = useState("visitor");
  const [clubs, setClubs] = useState([]);
  const [clubId, setClubId] = useState("");
  const [clubError, setClubError] = useState("");
  const [signInError, setSignInError] = useState("");
  const [entering, setEntering] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (role !== "club") return;
    let active = true;
    getDocs(collection(db, "clubs")).then((snapshot) => {
      if (active) {
        setClubs(snapshot.docs
          .map((item) => ({ ...item.data(), id: item.id }))
          .filter((club) => club.name)
          .sort((a, b) => a.name.localeCompare(b.name)));
        setClubError("");
      }
    }).catch(() => {
      if (active) setClubError("Could not load clubs. Please try again.");
    });
    return () => { active = false; };
  }, [role]);

  const selectedClub = clubs.find((club) => club.id === clubId);
  const managerVerified = Boolean(
    authUser?.uid && venue?.ownerUid === authUser.uid
  );
  const clubVerified = authorizedClubAdmin(selectedClub, authUser);

  async function signIn() {
    setBusy(true);
    setSignInError("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setSignInError(error?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  if (entering && venue) {
    return <VenueLandingPage
      venue={venue}
      role={role}
      club={role === "club" && clubVerified ? selectedClub : null}
      managerVerified={managerVerified}
      onBack={() => setEntering(false)}
    />;
  }

  if (!venue) return null;

  const name = String(venue.name || "League venue").trim();
  const location = venue.location || {};
  const place = [location.suburb, location.city].filter(Boolean).join(", ");
  const initials = name.split(/\s+/).slice(0, 2)
    .map((word) => word[0]?.toUpperCase()).join("");
  const website = venue.websiteUrl
    && /^https?:\/\//i.test(venue.websiteUrl)
    ? venue.websiteUrl : "";
  const image = venue.coverImageUrl || "/HomePage/ClubPhoto_marketing.jpeg";

  return createPortal(
    <main className="venue-entry">
      <div className="venue-entry__photo" style={{ backgroundImage: `url("${image}")` }} />
      <div className="venue-entry__shade" />

      <div className="venue-entry__layout">
        <header className="venue-entry__top">
          <button className="venue-entry__back" type="button" onClick={onBack}>
            <span aria-hidden="true">←</span> Explore Leagues
          </button>
          <span className="venue-entry__brand">5 Asides Near Me</span>
        </header>

        <div className="venue-entry__content">
          <div className="venue-entry__copy">
            <span className="venue-entry__eyebrow">THE FIELD · THE CLUBS · THE LEAGUE</span>
            <h1>Welcome to <em>{name}</em></h1>
            <p className="venue-entry__intro">
              A home for the clubs that play here. Find the field, meet its league,
              and follow what happens next.
            </p>
            <a className="venue-entry__action" href="#venue-entry-roles">
              Explore this venue <span aria-hidden="true">↗</span>
            </a>
          </div>

          <aside className="venue-entry__identity" aria-label={`${name} venue identity`} style={{ backgroundImage: `linear-gradient(0deg, rgba(4,18,34,.94), rgba(4,18,34,.08) 70%), url("${image}")` }}>
            <div className="venue-entry__identity-top">
              <span>LEAGUE VENUE</span><span aria-hidden="true">✦</span>
            </div>
            <div className="venue-entry__monogram" aria-hidden="true">{initials}</div>
            <div className="venue-entry__identity-bottom">
              <strong>{name}</strong>
              <span>{place || "Location to be announced"}</span>
            </div>
          </aside>
        </div>

        <footer className="venue-entry__footer">
          <span>PLAY LOCAL. BELONG EVERYWHERE.</span>
          <span>{place || "League venue"}</span>
        </footer>
      </div>

      <section id="venue-entry-roles" className="venue-entry__gateway" aria-label="Enter the venue">
        <div className="venue-entry__gateway-inner">
          <span className="venue-entry__eyebrow">YOUR WAY IN</span>
          <h2>Who are you?</h2>
          <div className="venue-entry__roles" role="group" aria-label="Choose entry role">
            {[
              ["visitor", "I'm a visitor", "See the venue and public league news"],
              ["club", "I represent a club", "Find your existing FANM club"],
              ["manager", "I'm the field manager", "Manage this venue"],
            ].map(([value, title, detail]) => (
              <button
                type="button"
                key={value}
                className={role === value ? "venue-entry__role is-active" : "venue-entry__role"}
                aria-pressed={role === value}
                onClick={() => { setRole(value); setSignInError(""); }}
              >
                <strong>{title}</strong><span>{detail}</span>
              </button>
            ))}
          </div>

          <div className="venue-entry__role-panel">
            {role === "visitor" && (
              <>
                <h3>Welcome in</h3>
                <p>You can explore this venue without an account.</p>
              </>
            )}
            {role === "manager" && (
              <>
                <h3>Field manager entry</h3>
                <p>Sign in with the account that registered {name}.</p>
                {managerVerified
                  ? <p className="venue-entry__verified">Manager identity confirmed.</p>
                  : authUser
                    ? <p>This account is not registered as this venue's manager.</p>
                    : <button type="button" onClick={signIn} disabled={busy}>
                        {busy ? "Signing in…" : "Sign in with Google"}
                      </button>}
              </>
            )}
            {role === "club" && (
              <>
                <h3>Club representative entry</h3>
                <p>Select your existing FANM club. Only its registered admin can enter as its representative.</p>
                <label htmlFor="venue-club-select">Your club</label>
                <select
                  id="venue-club-select"
                  value={clubId}
                  onChange={(event) => setClubId(event.target.value)}
                >
                  <option value="">Select a club…</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>{club.name}</option>
                  ))}
                </select>
                {clubError && <p role="alert">{clubError}</p>}
                {clubVerified
                  ? <p className="venue-entry__verified">Club representative confirmed.</p>
                  : selectedClub && authUser
                    ? <p>This account is not listed as an admin of {selectedClub.name}.</p>
                    : !authUser
                      ? <button type="button" onClick={signIn} disabled={busy}>
                          {busy ? "Signing in…" : "Sign in with Google"}
                        </button>
                      : null}
              </>
            )}
            {signInError && <p role="alert">{signInError}</p>}
            <button
              className="venue-entry__continue"
              type="button"
              disabled={
                (role === "manager" && !managerVerified) ||
                (role === "club" && !clubVerified)
              }
              onClick={() => setEntering(true)}
            >
              {role === "visitor" ? "Explore the venue"
                : role === "manager" ? "Enter as field manager"
                : "Enter with your club"} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
      </section>

      <section id="venue-entry-details" className="venue-entry__details">
        <div className="venue-entry__details-inner">
          <span className="venue-entry__eyebrow">YOUR FIELD, YOUR LEAGUE</span>
          <h2>{name}</h2>
          <p>
            {place || "Location to be announced"}
            {location.address ? ` · ${location.address}` : ""}
          </p>
          <div className="venue-entry__details-grid">
            <div>
              <span>01 / THE FIELD</span>
              <h3>Where clubs meet</h3>
              <p>This is the venue's space for the clubs and players who call this field home.</p>
            </div>
            <div>
              <span>02 / THE LEAGUE</span>
              <h3>The next season starts here</h3>
              <p>League seasons, club invitations and field updates will appear as the manager sets them up.</p>
            </div>
          </div>
          {website && (
            <a className="venue-entry__website" href={website} target="_blank" rel="noreferrer">
              Visit the venue website ↗
            </a>
          )}
        </div>
      </section>
    </main>,
    document.body
  );
}
