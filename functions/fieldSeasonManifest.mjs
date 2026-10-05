const validId = value => typeof value === "string" &&
  /^[A-Za-z0-9_-]{1,150}$/.test(value);

export function seasonPaidManifest({squad, scope}) {
  if (!squad || squad.version !== 1 || squad.status !== "active" ||
      !scope || ["venueId", "seasonId", "clubId"].some(key =>
        !validId(scope[key]) || squad[key] !== scope[key])) {
    throw new Error("The season squad does not match this Club and Field.");
  }
  const entries = Object.values(squad.entries || {});
  if (entries.length > 30) throw new Error("Invalid season squad capacity.");
  const members = new Set();
  const players = new Set();
  const eligible = [];
  for (const entry of entries) {
    if (!validId(entry?.memberId) || !validId(entry.sourcePlayerId) ||
        members.has(entry.memberId) || players.has(entry.sourcePlayerId)) {
      throw new Error("Correct duplicate or invalid season squad player links.");
    }
    members.add(entry.memberId);
    players.add(entry.sourcePlayerId);
    if (entry.invitationStatus !== "accepted" ||
        entry.paymentStatus !== "paid") continue;
    if (entry.currency !== "ZAR" ||
        !Number.isSafeInteger(entry.contributionCents) ||
        entry.contributionCents <= 0 ||
        entry.paidCents !== entry.contributionCents ||
        typeof entry.paymentConfirmedByUid !== "string" ||
        !entry.paymentConfirmedByUid ||
        typeof entry.fullName !== "string" || !entry.fullName.trim()) {
      throw new Error("A confirmed season payment needs valid contribution records.");
    }
    eligible.push({
      memberId: entry.memberId,
      sourcePlayerId: entry.sourcePlayerId,
      fullName: entry.fullName.trim(),
      clubId: scope.clubId,
      contributionCents: entry.contributionCents,
    });
  }
  return eligible;
}
