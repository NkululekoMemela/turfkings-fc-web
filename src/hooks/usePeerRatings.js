// src/hooks/usePeerRatings.js
import { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, onSnapshot } from "firebase/firestore";

function toNumberOrNull(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * Returns an object:
 * {
 *   [playerName]: {
 *      attackAvg,
 *      defenceAvg,
 *      gkAvg,
 *      voteCount
 *   }
 * }
 */
export function usePeerRatings() {
  const [peerRatingsByPlayer, setPeerRatingsByPlayer] = useState({});

  useEffect(() => {
    const colRef = collection(db, "peerRatings");

    const unsub = onSnapshot(colRef, (snap) => {
      const acc = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const rawName = d?.targetName || d?.playerName;
        if (!rawName || typeof rawName !== "string") return;

        const name = rawName.trim();
        if (!name) return;

        if (!acc[name]) {
          acc[name] = {
            attackSum: 0,
            attackCount: 0,
            defenceSum: 0,
            defenceCount: 0,
            gkSum: 0,
            gkCount: 0,
          };
        }

        const rec = acc[name];

        const a = toNumberOrNull(d.attack);
        const df = toNumberOrNull(d.defence);
        const gk = toNumberOrNull(d.gk);

        if (a != null) {
          rec.attackSum += a;
          rec.attackCount += 1;
        }
        if (df != null) {
          rec.defenceSum += df;
          rec.defenceCount += 1;
        }
        if (gk != null) {
          rec.gkSum += gk;
          rec.gkCount += 1;
        }
      });

      const out = {};
      Object.entries(acc).forEach(([name, rec]) => {
        const attackAvg =
          rec.attackCount > 0
            ? rec.attackSum / rec.attackCount
            : null;
        const defenceAvg =
          rec.defenceCount > 0
            ? rec.defenceSum / rec.defenceCount
            : null;
        const gkAvg =
          rec.gkCount > 0 ? rec.gkSum / rec.gkCount : null;

        out[name] = {
          attackAvg,
          defenceAvg,
          gkAvg,
          voteCount:
            rec.attackCount + rec.defenceCount + rec.gkCount,
        };
      });

      setPeerRatingsByPlayer(out);
    });

    return () => unsub();
  }, []);

  return peerRatingsByPlayer;
}
