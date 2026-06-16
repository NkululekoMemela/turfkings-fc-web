import React, { useEffect, useRef, useState } from "react";

const GOOGLE_PLACES_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

let googlePlacesPromise = null;

function loadGooglePlacesScript() {
  if (!GOOGLE_PLACES_API_KEY) return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);

  if (!googlePlacesPromise) {
    googlePlacesPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-google-places='true']");
      if (existing) {
        existing.addEventListener("load", () => resolve(true));
        existing.addEventListener("error", reject);
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_PLACES_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googlePlaces = "true";
      script.onload = () => resolve(true);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  return googlePlacesPromise;
}

function getAddressPart(place, type) {
  const item = place?.address_components?.find((component) =>
    component.types?.includes(type)
  );
  return item?.long_name || "";
}

export default function HomePage_HUB_GoogleVenueInput({
  value = "",
  onTextChange,
  onPlaceSelected,
}) {
  const inputRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadGooglePlacesScript()
      .then((loaded) => {
        if (!cancelled) setReady(Boolean(loaded));
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || !window.google?.maps?.places) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["name", "formatted_address", "geometry", "address_components", "place_id"],
      types: ["establishment", "geocode"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const city =
        getAddressPart(place, "locality") ||
        getAddressPart(place, "postal_town") ||
        getAddressPart(place, "administrative_area_level_2");

      const suburb =
        getAddressPart(place, "sublocality") ||
        getAddressPart(place, "sublocality_level_1") ||
        getAddressPart(place, "neighborhood");

      const province =
        getAddressPart(place, "administrative_area_level_1") ||
        getAddressPart(place, "administrative_area_level_2");

      const country = getAddressPart(place, "country");

      onPlaceSelected?.({
        venueName: place?.name || value,
        address: place?.formatted_address || "",
        suburb,
        city,
        province,
        country,
        placeId: place?.place_id || "",
        latitude: place?.geometry?.location?.lat?.() || null,
        longitude: place?.geometry?.location?.lng?.() || null,
      });
    });

    return () => {
      window.google?.maps?.event?.removeListener(listener);
    };
  }, [ready, onPlaceSelected, value]);

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onTextChange?.(event.target.value)}
        placeholder="Search venue or type manually"
      />
      <small className="hub-field-hint">
        {GOOGLE_PLACES_API_KEY
          ? "Start typing a venue name and select the best match."
          : "Google venue search is not connected yet. Manual typing still works."}
      </small>
    </>
  );
}
