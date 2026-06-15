import React from "react";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";

const HOME_FALLBACK_CENTER = { lat: -33.9608, lng: 18.4860 };

function getClubPoint(club = {}) {
  const lat =
    club?.locationDetails?.latitude ??
    club?.locationDetails?.lat ??
    club?.coordinates?.latitude ??
    club?.coordinates?.lat ??
    club?.latitude ??
    club?.lat;

  const lng =
    club?.locationDetails?.longitude ??
    club?.locationDetails?.lng ??
    club?.locationDetails?.lon ??
    club?.coordinates?.longitude ??
    club?.coordinates?.lng ??
    club?.coordinates?.lon ??
    club?.longitude ??
    club?.lng ??
    club?.lon;

  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { lat: latitude, lng: longitude };
}

export default function HomePage_HUB_ClubGoogleMap({
  apiKey,
  clubs = [],
  onSelectClub,
}) {
  const clubPoints = clubs
    .map((club) => ({ club, point: getClubPoint(club) }))
    .filter((item) => item.point);

  const center = clubPoints[0]?.point || HOME_FALLBACK_CENTER;

  if (!apiKey) {
    return (
      <div className="hub-map-missing-key">
        <strong>Google Maps is almost ready.</strong>
        <span>Add VITE_GOOGLE_MAPS_API_KEY to your environment file.</span>
      </div>
    );
  }

  return (
    <div className="hub-google-map-shell">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          defaultZoom={10}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "420px" }}
        >
          {clubPoints.map(({ club, point }) => (
            <Marker
              key={club.id || club.name}
              position={point}
              title={club.name || "Club"}
              onClick={() => onSelectClub?.(club)}
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}
