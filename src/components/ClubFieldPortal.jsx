import FieldChoiceCards from "./FieldChoiceCards.jsx";
import FieldPortalTile, { FieldPortalDialog } from "./FieldPortalTile.jsx";
import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebaseConfig.js";
import { watchLeagueVenues } from "../storage/leagueVenueRepository.js";
import {
  canManageClubField, watchClubFieldMembership, joinClubToField,
} from "../storage/clubFieldMembershipRepository.js";

export default function ClubFieldPortal({
  clubId, onEnterField, onExploreFields, tileStyle,
}) {
  const [portalOpen, setPortalOpen] = useState(false);
  const [user, setUser] = useState(auth.currentUser);
  const [club, setClub] = useState(null);
  const [membership, setMembership] = useState(null);
  const [field, setField] = useState(null);
  const [fields, setFields] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!clubId) return undefined;
    setLoading(true);
    setMembership(null);
    setChanging(false);
    setError("");
    const fail = cause => {
      setError(cause.message || "Could not load Field membership.");
      setLoading(false);
    };
    const stopClub = onSnapshot(doc(db, "clubs", clubId),
      snapshot => setClub(snapshot.data() || null), fail);
    const stopMembership = watchClubFieldMembership(clubId, value => {
      setMembership(value);
      setLoading(false);
    }, fail);
    const stopFields = watchLeagueVenues(setFields, fail);
    // Club visitors travel only after their Club joins a Field.


  return () => {
      stopClub();
      stopMembership();
      stopFields();
    };
  }, [clubId]);

  useEffect(() => {
    setField(null);
    if (!membership?.venueId) return undefined;
    return onSnapshot(doc(db, "leagueVenues", membership.venueId),
      snapshot => setField(snapshot.exists()
        ? { ...snapshot.data(), id: snapshot.id } : null),
      cause => setError(cause.message || "Could not load your Field."));
  }, [membership?.venueId]);

  if (!clubId) return null;
  const canManage = canManageClubField(club, user);
  const hasMembership = membership?.status === "active";
  const chooseField = !hasMembership || changing;

  async function saveMembership() {
    if (busy || !selectedId) return;
    const target = fields.find(item => item.id === selectedId);
    if (hasMembership && selectedId !== membership.venueId &&
        !window.confirm(`Move this Club to ${target?.name || "this Field"}? Previous season records will remain available.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await joinClubToField({ clubId, venueId: selectedId });
      setChanging(false);
      setSelectedId("");
    } catch (cause) {
      setError(cause.message || "Could not join the Field.");
    } finally {
      setBusy(false);
    }
  }

  if (!hasMembership && !canManage) return null;

  return (
    <>
      <div className="field-travel-tile-slot" style={{ position: "relative", minWidth: 0 }}>
        <FieldPortalTile
          style={{
            ...tileStyle, width: "100%",
            ...(canManage ? { paddingBottom: "40px" } : {}),
          }}
          label={hasMembership ? `Go to ${field?.name || "your Field"}` : "Your Club's Field"}
          subtitle={hasMembership ? "" : "Choose where your Club plays"}
          disabled={loading || busy || (hasMembership && !field)}
          destination={hasMembership && field ? field.name : undefined}
          onClick={hasMembership && field
            ? () => onEnterField?.(field)
            : () => setPortalOpen(true)}
        />
        {canManage && (
          <button type="button" className="secondary-btn"
            disabled={busy} onClick={() => setPortalOpen(true)}
            style={{
              position: "absolute", bottom: "8px", left: "50%",
              transform: "translateX(-50%)", zIndex: 1,
              padding: "4px 10px", minHeight: "26px",
              fontSize: ".75rem", whiteSpace: "nowrap",
            }}>
            Manage Field
          </button>
        )}
      </div>
      {portalOpen && (
        <FieldPortalDialog fullscreen onClose={() => { if (!busy) setPortalOpen(false); }}>
    <section className="field-discovery-panel" aria-label="Club Field membership" style={{
      display: "grid", gap: ".65rem", marginBottom: "1rem",
      padding: "1rem", border: "1px solid rgba(251,191,36,.5)",
      borderRadius: "20px", color: "#fff",
      background: "linear-gradient(110deg, #16172d, #35203e)",
    }}>
      <h2 className="field-discovery-title">Fields near you</h2>
      {loading ? <p role="status">Loading your Club's Field…</p> : (
        <>
          {hasMembership && !chooseField ? (
            <>
              <strong>{field?.name || "Your Club's Field"}</strong>
              <button type="button" className="primary-btn"
                disabled={!field || busy}
                onClick={() => onEnterField?.(field)}>
                Enter Field ↗
              </button>
              {canManage && !changing && (
                <button type="button" className="secondary-btn"
                  onClick={() => setChanging(true)}>
                  Change Field
                </button>
              )}
            </>
          ) : (
            <p style={{ margin: 0 }}>
              {canManage
                ? "Choose the Field your Club belongs to. You only need to join once."
                : "Your Club admin can choose the Field your Club belongs to."}
            </p>
          )}
          {canManage && chooseField && (
            <>
              <FieldChoiceCards
                fields={fields}
                selectedId={selectedId}
                onSelect={setSelectedId}
                disabled={busy}
              />
              <button type="button" className="primary-btn"
                disabled={busy || !selectedId}
                onClick={saveMembership}>
                {busy ? "Saving…" : hasMembership ? "Confirm Field Change" : "Join Field"}
              </button>
              {changing && (
                <button type="button" className="secondary-btn"
                  disabled={busy} onClick={() => setChanging(false)}>
                  Cancel
                </button>
              )}
            </>
          )}
        </>
      )}
      {error && <p role="alert" className="error-text">{error}</p>}
      {canManage && !chooseField && typeof onExploreFields === "function" && (
        <button type="button" className="secondary-btn" onClick={onExploreFields}>
          Explore Fields ↗
        </button>
      )}
    </section>
        </FieldPortalDialog>
      )}
    </>
  );
}
