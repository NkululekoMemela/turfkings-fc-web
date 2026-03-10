// src/hooks/usePeerRatings.js
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";

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

function getStartOfWeekFromKey(weekKey) {
  const s = String(weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function getCurrentWeekKey() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
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

function getWeekDistanceFromCurrent(weekKey, currentWeekKey) {
  const a = getStartOfWeekFromKey(weekKey);
  const b = getStartOfWeekFromKey(currentWeekKey);

  if (!a || !b) return null;

  const diffMs = b.getTime() - a.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));

  return diffWeeks;
}

function getRecencyWeight(weekKey, currentWeekKey) {
  const diffWeeks = getWeekDistanceFromCurrent(weekKey, currentWeekKey);

  if (diffWeeks == null) return 0;
  if (diffWeeks < 0) return 0; // future reviews ignored

  // Current week should dominate at 60%.
  if (diffWeeks === 0) return 0.6;

  // Older weeks decay quickly but still contribute inside the same season.
  if (diffWeeks === 1) return 0.2;
  if (diffWeeks === 2) return 0.1;
  if (diffWeeks === 3) return 0.06;
  if (diffWeeks === 4) return 0.04;

  // Too old to matter much, but still non-zero within season.
  return 0.02;
}

/**
 * Returns:
 * {
 *   [playerName]: {
 *      attackAvg,
 *      defenceAvg,
 *      gkAvg,
 *      voteCount,
 *      weightedVoteCount,
 *      hasCurrentWeekReview
 *   }
 * }
 *
 * Rules:
 * - only current season reviews are used
 * - current week reviews carry the highest weight
 * - older weeks decay fast
 * - previous-season reviews are ignored completely
 */
export function usePeerRatings(activeSeasonId = null) {
  const [peerRatingsByPlayer, setPeerRatingsByPlayer] = useState({});

  useEffect(() => {
    const colRef = collection(db, "peerRatings");
    const currentWeekKey = getCurrentWeekKey();
    const activeSeasonKey = String(activeSeasonId || "").trim();

    const unsub = onSnapshot(colRef, (snap) => {
      const acc = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};

        const rawName =
          d?.targetName ||
          d?.playerName ||
          d?.targetNameNormalized ||
          "";
        if (!rawName || typeof rawName !== "string") return;

        const reviewSeasonId = String(d?.seasonId || "").trim();

        // Confine ratings to current season only.
        if (activeSeasonKey && reviewSeasonId !== activeSeasonKey) return;
        if (!activeSeasonKey && reviewSeasonId) return;

        const weekKey = String(d?.weekKey || "").trim();
        const weight = getRecencyWeight(weekKey, currentWeekKey);

        if (weight <= 0) return;

        const name = toTitleCase(rawName);
        if (!name) return;

        const key = safeLower(name);

        if (!acc[key]) {
          acc[key] = {
            displayName: name,

            attackWeightedSum: 0,
            attackWeightTotal: 0,
            attackVotes: 0,

            defenceWeightedSum: 0,
            defenceWeightTotal: 0,
            defenceVotes: 0,

            gkWeightedSum: 0,
            gkWeightTotal: 0,
            gkVotes: 0,

            weightedVoteCount: 0,
            rawVoteCount: 0,
            hasCurrentWeekReview: false,
          };
        }

        const rec = acc[key];

        const a = toNumberOrNull(d.attack);
        const df = toNumberOrNull(d.defence);
        const gk = toNumberOrNull(d.gk);

        if (weekKey === currentWeekKey) {
          rec.hasCurrentWeekReview = true;
        }

        if (a != null) {
          rec.attackWeightedSum += a * weight;
          rec.attackWeightTotal += weight;
          rec.attackVotes += 1;
          rec.rawVoteCount += 1;
          rec.weightedVoteCount += weight;
        }

        if (df != null) {
          rec.defenceWeightedSum += df * weight;
          rec.defenceWeightTotal += weight;
          rec.defenceVotes += 1;
          rec.rawVoteCount += 1;
          rec.weightedVoteCount += weight;
        }

        if (gk != null) {
          rec.gkWeightedSum += gk * weight;
          rec.gkWeightTotal += weight;
          rec.gkVotes += 1;
          rec.rawVoteCount += 1;
          rec.weightedVoteCount += weight;
        }
      });

      const out = {};

      Object.values(acc).forEach((rec) => {
        const attackAvg =
          rec.attackWeightTotal > 0
            ? rec.attackWeightedSum / rec.attackWeightTotal
            : null;

        const defenceAvg =
          rec.defenceWeightTotal > 0
            ? rec.defenceWeightedSum / rec.defenceWeightTotal
            : null;

        const gkAvg =
          rec.gkWeightTotal > 0
            ? rec.gkWeightedSum / rec.gkWeightTotal
            : null;

        out[rec.displayName] = {
          attackAvg,
          defenceAvg,
          gkAvg,
          voteCount: rec.rawVoteCount,
          weightedVoteCount: rec.weightedVoteCount,
          hasCurrentWeekReview: rec.hasCurrentWeekReview,
        };
      });

      setPeerRatingsByPlayer(out);
    });

    return () => unsub();
  }, [activeSeasonId]);

  return peerRatingsByPlayer;
}