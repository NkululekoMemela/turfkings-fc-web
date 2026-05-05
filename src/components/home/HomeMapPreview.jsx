// src/components/home/HomeMapPreview.jsx
import React from "react";

export default function HomeMapPreview({ clubs = [] }) {
  return (
    <section className="fanm-section fanm-map-section" id="map">
      <div className="fanm-section-head">
        <div>
          <span className="fanm-kicker">Map preview</span>
          <h2>Clubs near you</h2>
        </div>
        <p>
          This is intentionally lower on the page. Later it can become a real map with club pins.
        </p>
      </div>

      <div className="fanm-map-preview">
        <div className="fanm-map-canvas" aria-hidden="true">
          <span className="fanm-map-pin fanm-map-pin--one">⚽</span>
          <span className="fanm-map-pin fanm-map-pin--two">⚽</span>
          <span className="fanm-map-pin fanm-map-pin--three">⚽</span>
        </div>
        <div className="fanm-map-list">
          {clubs.slice(0, 3).map((club) => (
            <div key={club.id}>
              <strong>{club.name}</strong>
              <span>{club.location}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}