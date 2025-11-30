// src/core/nameMapping.js
import { useMemo } from "react";

/**
 * Build a map of "aliases" -> canonical player name from Firestore members.
 * Aliases include:
 *  - fullName   (e.g. "Nkululeko Memela")
 *  - shortName  (e.g. "Nkululeko" or "Scott")
 *  - first name from fullName
 *
 * normalizeName("Nkululeko")  -> "Nkululeko Memela"
 * normalizeName("Scott")      -> "Scott Eyono"
 */
export function useMemberNameMap(members) {
  const aliasMap = useMemo(() => {
    const m = new Map();

    (members || []).forEach((mem) => {
      if (!mem) return;
      const fullName = String(mem.fullName || "").trim();
      const shortName = String(mem.shortName || "").trim();
      const email = String(mem.email || "").trim();

      const aliases = new Set();

      if (fullName) {
        aliases.add(fullName);
        const first = fullName.split(/\s+/)[0];
        if (first) aliases.add(first); // "Nkululeko"
      }

      if (shortName) {
        aliases.add(shortName);        // "Scott"
      }

      if (email) {
        aliases.add(email);            // just in case it shows up
      }

      aliases.forEach((alias) => {
        const key = alias.toLowerCase();
        if (!m.has(key)) {
          m.set(key, {
            displayName: fullName || shortName || alias,
            fullName: fullName || null,
            shortName: shortName || null,
          });
        }
      });
    });

    return m;
  }, [members]);

  const normalizeName = (raw) => {
    if (!raw || typeof raw !== "string") return raw;
    const key = raw.toLowerCase().trim();
    const hit = aliasMap.get(key);
    return hit ? hit.displayName : raw; // fallback to original if unknown
  };

  return { normalizeName, aliasMap };
}
