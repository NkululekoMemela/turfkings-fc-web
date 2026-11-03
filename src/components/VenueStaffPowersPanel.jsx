import React, { useEffect, useState } from "react";
import { watchVenueStaff } from "../storage/leagueVenueRepository.js";
import {
  watchAllVenueStaffPermissions, saveVenueStaffPermissions,
} from "../storage/venueStaffPermissionsRepository.js";
import "./VenueStaffPowersPanel.css";

function StaffPowersRow({ venueId, staff, permissions }) {
  const [draft, setDraft] = useState({ endMatchDay: false, endSeason: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft({
      endMatchDay: permissions?.endMatchDay === true,
      endSeason: permissions?.endSeason === true,
    });
  }, [permissions?.endMatchDay, permissions?.endSeason]);

  return (
    <form className="field-powers__person" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setMessage("");
      try {
        await saveVenueStaffPermissions({
          venueId, staffUid: staff.id, ...draft,
        });
        setMessage("Powers saved.");
      } catch (error) {
        setMessage(error.message || "Could not save these powers.");
      } finally {
        setBusy(false);
      }
    }}>
      <div className="field-powers__identity">
        <strong>{staff.fullName || staff.name || staff.email || "Field staff"}</strong>
        <span>{String(staff.role || "Staff").replaceAll("_", " ")}</span>
      </div>
      <div className="field-powers__switches">
        {[
          ["endMatchDay", "End Match Day"],
          ["endSeason", "End Season"],
        ].map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <input type="checkbox" role="switch"
              checked={draft[key]} disabled={busy}
              onChange={event => setDraft(previous => ({
                ...previous, [key]: event.target.checked,
              }))} />
          </label>
        ))}
      </div>
      <div className="field-powers__save">
        <span role="status">{message}</span>
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save powers"}
        </button>
      </div>
    </form>
  );
}

export default function VenueStaffPowersPanel({ venueId, ownerUid, onClose }) {
  const [staff, setStaff] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setError("");
    const onError = failure => setError(
      failure.message || "Could not load staff powers."
    );
    const stopStaff = watchVenueStaff(venueId, people => {
      setStaff(people);
      setLoaded(true);
    }, onError);
    const stopPermissions = watchAllVenueStaffPermissions(
      venueId, setPermissions, onError
    );
    return () => {
      stopStaff();
      stopPermissions();
    };
  }, [venueId]);

  const eligible = staff.filter(person =>
    person.status === "active" && person.id !== ownerUid &&
    person.uid === person.id
  );

  return (
    <div className="modal-backdrop field-powers-backdrop">
      <section className="field-powers" role="dialog" aria-modal="true"
        aria-labelledby="field-powers-title">
        <header>
          <div>
            <span className="field-powers__eyebrow">FIELD MANAGEMENT</span>
            <h2 id="field-powers-title">Staff powers</h2>
          </div>
          <button type="button" className="field-powers__close"
            aria-label="Close staff powers" onClick={onClose}>×</button>
        </header>
        <p className="field-powers__intro">
          Choose who can close a match day or season.
          Referees have neither power unless you assign it.
        </p>
        {error && <p role="alert" className="error-text">{error}</p>}
        {!loaded && !error && <p role="status">Loading staff…</p>}
        {loaded && !eligible.length && (
          <p>Staff must be approved and sign in before powers can be assigned.</p>
        )}
        {eligible.map(person => (
          <StaffPowersRow key={person.id} venueId={venueId}
            staff={person} permissions={permissions[person.id]} />
        ))}
      </section>
    </div>
  );
}
