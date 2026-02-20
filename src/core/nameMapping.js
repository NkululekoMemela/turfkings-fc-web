// src/core/nameMapping.js
import { useMemo } from "react";

/**
 * Robust alias -> canonical mapping from Firestore `members`.
 *
 * Canonical = fullName if present, else shortName, else empty.
 *
 * Aliases added (case-insensitive):
 * - fullName
 * - shortName
 * - email
 * - slug(fullName), slug(shortName), slug(email)
 * - any explicit `aliases[]` field (+ their slugs)
 *
 * First-name-only alias is added ONLY if that first name is UNIQUE across members.
 *
 * Backwards compatibility:
 * - normalizeName(raw) returns canonical full name when possible.
 * - aliasMap remains a Map(lowerAlias -> { displayName, fullName, shortName, email }).
 * Extras:
 * - displayNameShort(raw) returns shortName/firstName for UI only, without changing storage keys.
 */

function slugFromName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function safeLower(s) {
  return String(s || "").trim().toLowerCase();
}

function firstNameOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : "";
}

export function useMemberNameMap(members) {
  const { aliasMap, canonicalByKey, shortByCanonical } = useMemo(() => {
    const m = new Map();
    const canonByKey = new Map();
    const shortMap = new Map();

    // Count first names for uniqueness
    const firstNameCount = new Map();

    const rows = (members || [])
      .filter(Boolean)
      .map((mem) => {
        const fullName = String(mem?.fullName || "").trim();
        const shortName = String(mem?.shortName || "").trim();
        const email = String(mem?.email || "").trim();
        const aliases = Array.isArray(mem?.aliases) ? mem.aliases : [];

        const canonical = fullName || shortName || "";
        const first = firstNameOf(canonical);

        if (first) {
          const k = safeLower(first);
          firstNameCount.set(k, (firstNameCount.get(k) || 0) + 1);
        }

        return { fullName, shortName, email, aliases, canonical };
      });

    const addAlias = (alias, canonical, meta) => {
      const key = safeLower(alias);
      if (!key || !canonical) return;

      // stable: do not overwrite an existing alias mapping
      if (!m.has(key)) {
        m.set(key, {
          displayName: canonical,
          fullName: meta.fullName || canonical || null,
          shortName: meta.shortName || null,
          email: meta.email || null,
        });
      }

      if (!canonByKey.has(key)) canonByKey.set(key, canonical);
    };

    // Strong aliases + slugs
    rows.forEach(({ fullName, shortName, email, aliases, canonical }) => {
      if (!canonical) return;

      // canonical -> short lookup for UI
      if (canonical) {
        const canonKey = safeLower(canonical);
        if (canonKey && !shortMap.has(canonKey)) {
          shortMap.set(canonKey, shortName || firstNameOf(canonical) || canonical);
        }
      }

      const meta = { fullName, shortName, email };

      // canonical itself
      addAlias(canonical, canonical, meta);
      addAlias(slugFromName(canonical), canonical, meta);

      // full name
      if (fullName) {
        addAlias(fullName, canonical, meta);
        addAlias(slugFromName(fullName), canonical, meta);
      }

      // short name
      if (shortName) {
        addAlias(shortName, canonical, meta);
        addAlias(slugFromName(shortName), canonical, meta);
      }

      // email
      if (email) {
        addAlias(email, canonical, meta);
        addAlias(slugFromName(email), canonical, meta);
      }

      // explicit aliases[]
      (aliases || []).forEach((a) => {
        const aa = String(a || "").trim();
        if (!aa) return;
        addAlias(aa, canonical, meta);
        addAlias(slugFromName(aa), canonical, meta);
      });
    });

    // First-name-only alias ONLY if unique
    rows.forEach(({ canonical }) => {
      if (!canonical) return;
      const first = firstNameOf(canonical);
      const key = safeLower(first);
      if (!key) return;

      if (firstNameCount.get(key) === 1) {
        // safe unique first name
        addAlias(first, canonical, { fullName: canonical, shortName: first, email: null });
      }
    });

    return { aliasMap: m, canonicalByKey: canonByKey, shortByCanonical: shortMap };
  }, [members]);

  const normalizeName = (raw) => {
    if (!raw || typeof raw !== "string") return raw;
    const key = safeLower(raw);
    const hit = aliasMap.get(key);
    return hit ? hit.displayName : raw;
  };

  // UI-only: returns short/first name when possible, but never changes canonical storage keys
  const displayNameShort = (raw) => {
    if (!raw || typeof raw !== "string") return raw;
    const canon = normalizeName(raw);
    const ck = safeLower(canon);
    return shortByCanonical.get(ck) || firstNameOf(canon) || canon;
  };

  return { normalizeName, displayNameShort, aliasMap };
}
