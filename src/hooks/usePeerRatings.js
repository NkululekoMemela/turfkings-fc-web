// src/hooks/usePeerRatings.js
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  getPeerRatingsCollection,
  getScopedPeerRatingsCollection,
} from "../core/clubFirestorePaths";

function toNumberOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

function toTitleCase(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isValidWeekKey(weekKey) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(weekKey || "").trim());
}

function getCurrentWeekKey() {
  const now = new Date();
  const day = now.getDay();
  const sunday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - day
  );

  const y = sunday.getFullYear();
  const m = String(sunday.getMonth() + 1).padStart(2, "0");
  const d = String(sunday.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

export function usePeerRatings(
  activeSeasonId = null,
  {
    activeClubId = null,
    isPracticeMode = false,
    dataScope = null,
  } = {}
) {
  const [peerRatingsByPlayer, setPeerRatingsByPlayer] = useState({});

  useEffect(() => {
    // Official ratings remain under the real club.
    // Practice ratings are disposable session-scoped football data.
    // Never infer Practice from a synthetic club ID.
    const colRef = isPracticeMode
      ? getScopedPeerRatingsCollection(db, dataScope)
      : getPeerRatingsCollection(db, activeClubId);

    const currentWeekKey = getCurrentWeekKey();

    const unsub = onSnapshot(colRef, (snap) => {
      const players = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};

        const rawName =
          d?.targetName ||
          d?.playerName ||
          d?.targetNameNormalized ||
          "";

        if (!rawName || typeof rawName !== "string") return;

        const weekKey = String(d?.weekKey || "").trim();

        // Only real completed/current rating weeks may become persistent.
        if (!isValidWeekKey(weekKey) || weekKey > currentWeekKey) return;

        const name = toTitleCase(rawName);
        if (!name) return;

        const playerKey = safeLower(name);

        if (!players[playerKey]) {
          players[playerKey] = {
            displayName: name,
            weeks: {},
          };
        }

        if (!players[playerKey].weeks[weekKey]) {
          players[playerKey].weeks[weekKey] = {
            attackSum: 0,
            attackCount: 0,
            defenceSum: 0,
            defenceCount: 0,
            gkSum: 0,
            gkCount: 0,
            rawVoteCount: 0,
          };
        }

        const rec = players[playerKey].weeks[weekKey];
        const attack = toNumberOrNull(d.attack);
        const defence = toNumberOrNull(d.defence);
        const gk = toNumberOrNull(d.gk);

        if (attack != null) {
          rec.attackSum += attack;
          rec.attackCount += 1;
          rec.rawVoteCount += 1;
        }

        if (defence != null) {
          rec.defenceSum += defence;
          rec.defenceCount += 1;
          rec.rawVoteCount += 1;
        }

        if (gk != null) {
          rec.gkSum += gk;
          rec.gkCount += 1;
          rec.rawVoteCount += 1;
        }
      });

      const out = {};

      Object.values(players).forEach((player) => {
        const latestWeekKey = Object.keys(player.weeks)
          .filter((weekKey) => player.weeks[weekKey].rawVoteCount > 0)
          .sort()
          .at(-1);

        if (!latestWeekKey) return;

        const rec = player.weeks[latestWeekKey];

        out[player.displayName] = {
          attackAvg:
            rec.attackCount > 0
              ? rec.attackSum / rec.attackCount
              : null,
          defenceAvg:
            rec.defenceCount > 0
              ? rec.defenceSum / rec.defenceCount
              : null,
          gkAvg:
            rec.gkCount > 0
              ? rec.gkSum / rec.gkCount
              : null,
          voteCount: rec.rawVoteCount,
          weightedVoteCount: rec.rawVoteCount,
          hasCurrentWeekReview: latestWeekKey === currentWeekKey,
          latestWeekKey,
        };
      });

      setPeerRatingsByPlayer(out);
    });

    return () => unsub();
  }, [
    activeSeasonId,
    activeClubId,
    isPracticeMode,
    dataScope,
  ]);

  return peerRatingsByPlayer;
}