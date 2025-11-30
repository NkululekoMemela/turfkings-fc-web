// src/core/membersUtils.js

// Normalise for matching (case-insensitive, trimmed)
export function normaliseName(value) {
    return (value || "").trim().toLowerCase();
  }
  
  // Build lookup maps from members collection
  export function buildMemberMaps(members) {
    const byShort = new Map();
    const byFull = new Map();
    const byEmail = new Map();
    const byId = new Map();
  
    (members || []).forEach((m) => {
      if (!m) return;
      const id = m.id || m.uid || m.memberId; // adapt to your field
      if (id) byId.set(id, m);
  
      if (m.shortName) {
        byShort.set(normaliseName(m.shortName), m);
      }
      if (m.fullName) {
        byFull.set(normaliseName(m.fullName), m);
      }
      if (m.email) {
        byEmail.set(normaliseName(m.email), m);
      }
    });
  
    return { byShort, byFull, byEmail, byId };
  }
  
  // Given a raw name from old data, try to find the member
  export function resolveMemberForName(rawName, maps) {
    if (!rawName) return null;
    const key = normaliseName(rawName);
    if (!key) return null;
  
    const { byShort, byFull, byEmail } = maps || {};
    return (
      (byShort && byShort.get(key)) ||
      (byFull && byFull.get(key)) ||
      (byEmail && byEmail.get(key)) ||
      null
    );
  }
  