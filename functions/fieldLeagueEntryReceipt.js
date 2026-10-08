function validId(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{1,150}$/.test(value);
}

function pathFor(venueId, seasonId, clubId) {
  if (![venueId, seasonId, clubId].every(validId)) {
    throw new Error("Choose a valid Field, season and Club.");
  }
  return `leagueVenues/${venueId}/seasons/${seasonId}/clubEntryReceipts/${clubId}`;
}

function amountCents(season) {
  const fee = season?.entryFee;
  if (typeof fee !== "number" || !Number.isFinite(fee) ||
      fee < 0 || fee > 100000000 ||
      Math.abs(fee * 100 - Math.round(fee * 100)) > 0.00001) {
    throw new Error("The announced Club entry fee is invalid.");
  }
  return Math.round(fee * 100);
}

function accepted(season, clubId) {
  return season?.invitations?.[clubId]?.status === "accepted" &&
    Array.isArray(season.clubIds) && season.clubIds.includes(clubId);
}

function receiptMatches({venueId, season, clubId, receipt}) {
  return Boolean(receipt &&
    receipt.venueId === venueId && receipt.seasonId === season.id &&
    receipt.clubId === clubId && receipt.status === "paid" &&
    receipt.currency === "ZAR" &&
    receipt.amountCents === amountCents(season) &&
    typeof receipt.confirmedByUid === "string" && receipt.confirmedByUid &&
    Number.isFinite(receipt.confirmedAtMs));
}

function assertPaid(args) {
  if (!accepted(args.season, args.clubId)) {
    throw new Error("Both Clubs must accept the league invitation before playing.");
  }
  if (!receiptMatches(args)) {
    const name = args.season.invitations[args.clubId].clubName || args.clubId;
    throw new Error(
      `${name}: the Field administrator must confirm the Club entry payment before play.`
    );
  }
}

function activeSeason(context, seasonId) {
  const season = context.venue.league?.activeSeason;
  if (!validId(seasonId) || season?.id !== seasonId ||
      season.status !== "active" || !season.announcedAtMs) {
    throw new Error("This announced season is no longer active.");
  }
  return season;
}

async function view({db, user, venueId, seasonId, loadContext}) {
  const context = await loadContext(db, db, venueId, user);
  if (!context.isAdmin) {
    throw new Error("Only a Field administrator can view entry receipts.");
  }
  const season = activeSeason(context, seasonId);
  const due = amountCents(season);
  const ids = [...new Set(season.clubIds || [])].filter(id =>
    validId(id) && accepted(season, id));
  const clubs = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const snapshots = await db.getAll(
      ...batch.map(id => db.doc(pathFor(venueId, seasonId, id))),
      ...batch.map(id => db.doc(`clubs/${id}`))
    );
    batch.forEach((clubId, index) => {
      const receipt = snapshots[index].data();
      const profile = snapshots[batch.length + index]?.data() || {};
      clubs.push({
        logoUrl: String(profile.branding?.logoUrl || profile.logoUrl || ""),
        clubId,
        clubName: String(season.invitations[clubId].clubName || clubId),
        amountCents: due,
        paid: receiptMatches({venueId, season, clubId, receipt}),
        confirmedByName: receipt?.confirmedByName || "",
        confirmedAtMs: receipt?.confirmedAtMs || null,
      });
    });
  }
  return {seasonId, clubs: clubs.sort((a, b) => a.clubName.localeCompare(b.clubName))};
}

async function confirm({
  db, user, venueId, seasonId, clubId, expectedAmountCents,
  loadContext, now = Date.now(),
}) {
  const path = pathFor(venueId, seasonId, clubId);
  return db.runTransaction(async tx => {
    const context = await loadContext(tx, db, venueId, user);
    if (!context.isAdmin) {
      throw new Error("Only a Field administrator can confirm Club entry payment.");
    }
    const season = activeSeason(context, seasonId);
    if (!accepted(season, clubId)) {
      throw new Error("The Club must accept its invitation before receipt is recorded.");
    }
    const due = amountCents(season);
    if (expectedAmountCents !== due) {
      throw new Error("The entry fee changed. Refresh before confirming receipt.");
    }
    const ref = db.doc(path);
    const snapshot = await tx.get(ref);
    const previous = snapshot.data();
    if (previous) {
      if (!receiptMatches({venueId, season, clubId, receipt: previous})) {
        throw new Error("An existing entry receipt requires review.");
      }
      return {paid: true, alreadyConfirmed: true};
    }
    const receipt = {
      venueId, seasonId, clubId,
      clubName: String(season.invitations[clubId].clubName || clubId),
      amountCents: due, currency: "ZAR", status: "paid",
      confirmedByUid: user.uid,
      confirmedByName: String(
        context.staff?.name || context.venue.ownerName || user.name || user.uid
      ),
      confirmedAtMs: now,
      method: "field_confirmed_external_receipt",
    };
    tx.set(ref, receipt);
    return {paid: true, alreadyConfirmed: false};
  });
}

module.exports = {
  pathFor, amountCents, accepted, receiptMatches, assertPaid, view, confirm,
};
