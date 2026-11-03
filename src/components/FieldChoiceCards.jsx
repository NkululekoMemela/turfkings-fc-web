import React, { useEffect, useRef, useState } from "react";
import "./FieldDiscovery.css";

function coordinates(field) {
  const location = field.location || {};
  const lat = location.latitude ?? field.latitude;
  const lng = location.longitude ?? field.longitude;
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null;
}

function distance(a, b) {
  const rad = n => n * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) *
    Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export default function FieldChoiceCards({
  fields, selectedId, onSelect, disabled,
}) {
  const [origin, setOrigin] = useState(null);
  const [radius, setRadius] = useState(25);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState("");
  const [failedImages, setFailedImages] = useState({});
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  function locate() {
    if (!navigator.geolocation) {
      setNotice("Location is unavailable. You can still choose a Field.");
      return;
    }
    setLocating(true);
    setNotice("");
    navigator.geolocation.getCurrentPosition(position => {
      if (!alive.current) return;
      setOrigin(position.coords);
      setLocating(false);
    }, () => {
      if (!alive.current) return;
      setLocating(false);
      setNotice("Location could not be obtained. All Fields remain available.");
    }, { timeout: 8000, maximumAge: 300000 });
  }

  const rows = fields.filter(f => f.deleted !== true &&
    !["deleted", "inactive"].includes(String(f.status || "").toLowerCase()))
    .map(field => {
      const point = coordinates(field);
      return { field, km: origin && point ? distance(origin, point) : null };
    }).sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) ||
      String(a.field.name || "").localeCompare(String(b.field.name || "")));

  const visible = rows.filter(row => !origin || row.km == null ||
    row.km <= radius || row.field.id === selectedId);

  return (
    <div className="field-choice">
      <p className="field-choice-hint">Select a Field card, then confirm your Club’s membership.</p>
      {!origin ? (
        <button type="button" className="field-choice-location"
          disabled={disabled || locating} onClick={locate}>
          {locating ? "Finding your location…" : "Use my location"}
        </button>
      ) : (
        <label className="field-choice-radius">
          Radius from your location: <strong>{radius} km</strong>
          <input type="range" min="1" max="100" value={radius}
            disabled={disabled}
            onChange={event => setRadius(Number(event.target.value))} />
        </label>
      )}
      {notice && <small role="status">{notice}</small>}
      <div className="field-choice-grid">
        {visible.map(({ field, km }) => {
          const logo = field.branding?.logoUrl || field.logoUrl || field.image;
          const location = [field.suburb || field.location?.suburb,
            field.city || field.location?.city].filter(Boolean).join(", ");
          const selected = selectedId === field.id;
          return (
            <button key={field.id} type="button"
              className={`field-choice-card${selected ? " is-selected" : ""}`}
              aria-pressed={selected} disabled={disabled}
              onClick={() => onSelect(field.id)}>
              <span className="field-choice-badge">
                {logo && !failedImages[field.id] ? (
                  <img src={logo} alt="" loading="lazy"
                    onError={() => setFailedImages(current => ({
                      ...current, [field.id]: true,
                    }))} />
                ) : (
                  <span aria-hidden="true">🏟️</span>
                )}
              </span>
              <strong>{field.name || "Field"}</strong>
              <span className="field-choice-meta">{location || "Location not supplied"}</span>
              <span className="field-choice-distance">
                {km == null ? "Distance unavailable" : `${km.toFixed(1)} km away`}
              </span>
              <span className="field-choice-action">{selected ? "✓ Selected" : "Tap to select"}</span>
            </button>
          );
        })}
      </div>
      {!visible.length && <p role="status">No Fields found in this radius. Try a larger radius.</p>}
      {origin && rows.some(row => row.km == null) &&
        <small>Fields without recorded coordinates are also shown.</small>}
    </div>
  );
}
