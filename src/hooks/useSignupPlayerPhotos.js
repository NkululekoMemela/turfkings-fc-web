import {useEffect, useMemo, useState} from "react";
import {getDocs} from "firebase/firestore";
import {db} from "../firebaseConfig.js";
import {getPlayerPhotosCollection} from "../core/clubFirestorePaths";

function toTitleCaseLoose(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function firstNameOf(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "";
}

function slugFromLooseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export default function useSignupPlayerPhotos(activeClubId, inheritedPhotos = null) {
  const [playerPhotos, setPlayerPhotos] = useState({});
  useEffect(() => {
    let cancelled = false;
    setPlayerPhotos({});

    async function loadPhotos() {
      try {
        const snap = await getDocs(getPlayerPhotosCollection(db, activeClubId));
        if (cancelled) return;

        const loaded = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const photoData = data?.photoData || "";
          const rawName = data?.name || docSnap.id || "";
          if (!photoData) return;

          const title = toTitleCaseLoose(rawName);
          const first = firstNameOf(rawName);
          const slug = slugFromLooseName(rawName);

          [rawName, title, first, slug]
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .forEach((key) => {
              loaded[key] = photoData;
            });
        });

        setPlayerPhotos(loaded);
      } catch (err) {
        console.error("Failed to load player photos in MatchSignupPage:", err);
      }
    }

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [activeClubId]);
  const resolvedPhotos = useMemo(() => ({
    ...(playerPhotos || {}),
    ...Object.fromEntries(
      Object.entries(inheritedPhotos || {}).filter(([, value]) =>
        typeof value === "string" && value.trim()
      )
    ),
  }), [playerPhotos, inheritedPhotos]);

  const getPlayerPhoto = useMemo(() => {
    return (playerName = "") => {
      const raw = String(playerName || "").trim();
      if (!raw) return null;

      const title = toTitleCaseLoose(raw);
      const first = firstNameOf(raw);
      const slug = slugFromLooseName(raw);

      const candidates = [raw, title, first, slug]
        .map((x) => String(x || "").trim())
        .filter(Boolean);

      for (const key of candidates) {
        if (resolvedPhotos[key]) return resolvedPhotos[key];

        const matchedKey = Object.keys(resolvedPhotos).find(
          (k) => normKey(k) === normKey(key)
        );
        if (matchedKey && resolvedPhotos[matchedKey]) {
          return resolvedPhotos[matchedKey];
        }
      }

      return null;
    };
  }, [resolvedPhotos]);
  return getPlayerPhoto;
}
