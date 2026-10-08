const policy = require("./fieldTeamPaymentPolicy");

function validateUserAndField(user, venueId) {
  if (!user?.uid || user.cameraSession === true ||
      user.cameraSessionId || user.cameraHandoffId) {
    throw new Error("Sign in with your own Google account.");
  }
  if (typeof venueId !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(venueId)) {
    throw new Error("Choose a valid Field.");
  }
}

async function loadBankingContext(reader, db, venueId, user) {
  validateUserAndField(user, venueId);
  const root = `leagueVenues/${venueId}`;
  const [venueSnap, staffSnap, settingsSnap] = await reader.getAll(
    db.doc(root),
    db.doc(`${root}/staff/${user.uid}`),
    db.doc(`${root}/paymentConfig/current`),
  );
  const venue = venueSnap.data();
  if (!venueSnap.exists || venue.deleted === true ||
      venue.status === "deleted") {
    throw new Error("This Field is unavailable.");
  }
  const staff = staffSnap.data();
  return {
    venue, staff,
    settings: settingsSnap.data() ||
      {...policy.normalizeSettings(), revision: 0},
    isManager: policy.canAuthorizeFieldBanking(venue, user, staff),
    canSubmitSettings: policy.canSubmitFieldBanking(venue, staff, user),
    isAdmin: policy.canManageField(venue, staff, user),
  };
}

async function bankingView({db, user, venueId}) {
  const context = await loadBankingContext(db, db, venueId, user);
  if (!context.canSubmitSettings) {
    throw new Error("Only active Field staff can access banking settings.");
  }
  const requests = db.collection(`leagueVenues/${venueId}/bankingRequests`);
  const query = context.isManager
    ? requests.where("status", "==", "pending")
    : requests.where("submittedByUid", "==", user.uid);
  const snapshot = await query.get();
  return {
    settings: context.settings,
    isManager: context.isManager,
    isAdmin: context.isAdmin,
    requests: snapshot.docs.map(doc => ({...doc.data(), id: doc.id}))
      .sort((a, b) => b.submittedAtMs - a.submittedAtMs),
  };
}

async function saveBankingSettings({
  db, user, venueId, settings, expectedRevision, now = Date.now(),
}) {
  validateUserAndField(user, venueId);
  const proposed = policy.normalizeSettings(settings);
  if (!policy.bankReady(proposed.bank)) {
    throw new Error("Complete the Field banking details first.");
  }
  return db.runTransaction(async tx => {
    const context = await loadBankingContext(tx, db, venueId, user);
    if (!context.canSubmitSettings) {
      throw new Error("Only active Field staff can submit banking details.");
    }
    if (expectedRevision !== context.settings.revision) {
      throw new Error("Payment settings changed. Refresh before saving.");
    }
    const root = `leagueVenues/${venueId}`;
    const requestRef = db.doc(`${root}/bankingRequests/${user.uid}`);
    const previousRequest = await tx.get(requestRef);
    const auditRef = db.doc(
      `${root}/paymentAudit/${require("node:crypto").randomUUID()}`
    );

    const active = {
      ...context.settings,
      ...proposed,
      revision: context.settings.revision + 1,
      updatedAtMs: now,
      updatedByUid: user.uid,
      authorizedByUid: user.uid,
      authorizedAtMs: now,
    };
    tx.set(db.doc(`${root}/paymentConfig/current`), active);
    if (previousRequest.data()?.status === "pending") {
      tx.update(requestRef, {
        status: "superseded",
        reviewedByUid: user.uid,
        reviewedAtMs: now,
      });
    }
    tx.set(auditRef, {
      action: "settings_saved",
      actorUid: user.uid, atMs: now,
      before: context.settings, after: active,
    });
    return {saved: true};
  });
}

async function reviewBankingSettings({
  db, user, venueId, requestId, decision, now = Date.now(),
}) {
  validateUserAndField(user, venueId);
  if (typeof requestId !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(requestId)) {
    throw new Error("Choose a valid banking request.");
  }
  if (!["authorize", "reject"].includes(decision)) {
    throw new Error("Choose Authorize or Reject.");
  }

  return db.runTransaction(async tx => {
    const context = await loadBankingContext(tx, db, venueId, user);
    if (!context.isManager) {
      throw new Error("Only the Field manager can authorize banking activation.");
    }
    const root = `leagueVenues/${venueId}`;
    const ref = db.doc(`${root}/bankingRequests/${requestId}`);
    const snapshot = await tx.get(ref);
    const request = snapshot.data();
    if (!request || request.status !== "pending") {
      throw new Error("This request has already been reviewed.");
    }
    const applicant = await tx.get(
      db.doc(`${root}/staff/${request.submittedByUid}`)
    );

    if (decision === "authorize") {
      const eligible = policy.canSubmitFieldBanking(
        context.venue, applicant.data(),
        {uid: request.submittedByUid}
      );
      if (request.managerUid !== context.venue.ownerUid || !eligible) {
        throw new Error("Staff access or the manager changed. Reject and resubmit.");
      }
      if (request.baseRevision !== context.settings.revision) {
        throw new Error("Settings changed. Reject and request a new submission.");
      }
      const settings = policy.normalizeSettings(request.settings);
      if (!policy.bankReady(settings.bank)) {
        throw new Error("The banking details are incomplete.");
      }
      tx.set(db.doc(`${root}/paymentConfig/current`), {
        ...settings,
        revision: context.settings.revision + 1,
        updatedByUid: request.submittedByUid,
        updatedAtMs: now,
        authorizedByUid: user.uid,
        authorizedAtMs: now,
      });
    }

    tx.update(ref, {
      status: decision === "authorize" ? "authorized" : "rejected",
      reviewedByUid: user.uid,
      reviewedAtMs: now,
    });
    tx.set(db.doc(
      `${root}/paymentAudit/${require("node:crypto").randomUUID()}`
    ), {
      action: "banking_activation_reviewed",
      requestId, decision, actorUid: user.uid, atMs: now,
      settings: request.settings,
    });
    return {reviewed: true};
  });
}

async function signupView({db, user, venueId, clubId = ""}) {
  const context = await loadBankingContext(db, db, venueId, user);
  if (typeof clubId !== "string" ||
      (clubId && !/^[A-Za-z0-9_-]{1,150}$/.test(clubId))) {
    throw new Error("Choose a valid Club.");
  }

  let club = null;
  let membership = null;
  let canBook = false;
  if (clubId) {
    const [clubSnap, membershipSnap] = await db.getAll(
      db.doc(`clubs/${clubId}`),
      db.doc(`clubFieldMemberships/${clubId}`),
    );
    club = clubSnap.data();
    membership = membershipSnap.data();
    canBook = policy.canManageClub(club, user) &&
      membership?.status === "active" &&
      membership.venueId === venueId;
    if (!canBook && !context.canSubmitSettings) {
      throw new Error(
        "Sign in as this Club's admin or leader, and register it with this Field."
      );
    }
  } else if (!context.canSubmitSettings) {
    throw new Error("Enter this Field as a Club admin or leader to book.");
  }

  const season = policy.availableSeason(context.venue);
  const approved = policy.bankReady(context.settings.bank) &&
    Boolean(context.settings.authorizedByUid);
  return {
    canBook,
    canManageBanking: context.canSubmitSettings,
    isManager: context.isManager,
    isAdmin: context.isAdmin,
    club: club ? {
      id: clubId, name: club.name || clubId,
      logoUrl: club.branding?.logoUrl || club.logoUrl || "",
    } : null,
    settings: approved ? {
      bank: context.settings.bank,
      seasonPriceCents: context.settings.seasonPriceCents,
      matchDayPriceCents: context.settings.matchDayPriceCents,
      revision: context.settings.revision,
    } : null,
    season: season ? {
      id: season.id,
      name: season.name || "Field League Season",
      eligible: canBook && (season.clubIds || []).includes(clubId),
      fixtures: (season.fixtures || []).filter(fixture =>
        !clubId || [fixture.clubAId, fixture.clubBId].includes(clubId)
      ),
      matchDays: season.matchDays || [],
    } : null,
  };
}

async function createTeamBooking({
  db, user, body, now = Date.now(),
}) {
  validateUserAndField(user, body.venueId);
  const clubId = body.clubId;
  if (typeof clubId !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(clubId)) {
    throw new Error("Choose a valid Club.");
  }
  const root = `leagueVenues/${body.venueId}`;
  const payments = db.collection(`${root}/teamPayments`);

  return db.runTransaction(async tx => {
    const context = await loadBankingContext(tx, db, body.venueId, user);
    const [clubSnap, membershipSnap] = await tx.getAll(
      db.doc(`clubs/${clubId}`),
      db.doc(`clubFieldMemberships/${clubId}`),
    );
    const club = clubSnap.data();
    const membership = membershipSnap.data();
    if (!policy.canManageClub(club, user) ||
        membership?.status !== "active" ||
        membership.venueId !== body.venueId) {
      throw new Error("Only a registered Club's admin or leader can book.");
    }

    const plan = policy.bookingPlan({
      venue: context.venue, settings: context.settings,
      clubId, body, now,
    });
    const lockRef = db.doc(`${root}/paymentLocks/${clubId}`);
    await tx.get(lockRef);
    const ref = payments.doc(plan.id);
    const existing = await tx.get(ref);
    if (existing.exists && existing.data().status !== "cancelled") {
      return {booking: {...existing.data(), id: plan.id}};
    }
    const snapshot = await tx.get(
      payments.where("clubId", "==", clubId)
    );
    policy.assertNoOverlap(plan, snapshot.docs.map(doc => ({
      ...doc.data(), id: doc.id,
    })));

    const booking = {
      ...plan,
      venueId: body.venueId,
      clubId, clubName: club.name || clubId,
      venueName: context.venue.name || "Field",
      currency: "ZAR",
      method: "field_bank_transfer",
      amountPaidCents: 0,
      status: "pending",
      awaitingVerification: false,
      reference: `FIELD-${plan.id.slice(0, 12).toUpperCase()}`,
      bank: context.settings.bank,
      pricingRevision: context.settings.revision,
      createdAtMs: now, createdByUid: user.uid, updatedAtMs: now,
    };
    tx.set(lockRef, {updatedAtMs: now, bookingId: plan.id});
    tx.set(ref, booking);
    tx.set(db.doc(
      `${root}/paymentAudit/${require("node:crypto").randomUUID()}`
    ), {
      action: "booking_created",
      bookingId: plan.id, actorUid: user.uid, atMs: now,
    });
    return {booking};
  });
}

async function paymentView({db, user, venueId, clubId = ""}) {
  const context = await loadBankingContext(db, db, venueId, user);
  let signup = null;
  if (clubId) {
    signup = await signupView({db, user, venueId, clubId});
    if (!signup.canBook) {
      throw new Error("Only this Club's admin or leader can access its payments.");
    }
  } else if (!context.isAdmin) {
    throw new Error("Enter as a Club admin or a Field administrator.");
  }

  const payments = db.collection(`leagueVenues/${venueId}/teamPayments`);
  const snapshot = await (clubId
    ? payments.where("clubId", "==", clubId) : payments).get();
  return {
    isAdmin: !clubId && context.isAdmin,
    canBook: Boolean(signup?.canBook),
    club: signup?.club || null,
    settings: signup?.settings || null,
    bookings: snapshot.docs.map(doc => ({...doc.data(), id: doc.id}))
      .sort((a, b) => b.createdAtMs - a.createdAtMs),
  };
}

async function reportTeamTransfer({
  db, user, venueId, bookingId, now = Date.now(),
}) {
  validateUserAndField(user, venueId);
  if (typeof bookingId !== "string" || !/^[a-f0-9]{32}$/.test(bookingId)) {
    throw new Error("Choose a valid booking.");
  }
  const root = `leagueVenues/${venueId}`;
  const ref = db.doc(`${root}/teamPayments/${bookingId}`);
  return db.runTransaction(async tx => {
    const context = await loadBankingContext(tx, db, venueId, user);
    const snapshot = await tx.get(ref);
    const booking = snapshot.data();
    if (!booking || booking.venueId !== venueId) {
      throw new Error("This booking is unavailable.");
    }
    const [clubSnap, membershipSnap] = await tx.getAll(
      db.doc(`clubs/${booking.clubId}`),
      db.doc(`clubFieldMemberships/${booking.clubId}`),
    );
    const membership = membershipSnap.data();
    if (!policy.canManageClub(clubSnap.data(), user) ||
        membership?.status !== "active" || membership.venueId !== venueId) {
      throw new Error("Only this Club's admin or leader can report its transfer.");
    }
    if (booking.status === "cancelled") {
      throw new Error("This booking was cancelled.");
    }
    if (booking.status === "paid" || booking.awaitingVerification) {
      return {reported: true};
    }
    if (booking.kind === "season" &&
        policy.availableSeason(context.venue, now)?.id !== booking.seasonId) {
      throw new Error("This season is closed. Contact the Field administrator.");
    }
    tx.update(ref, {
      awaitingVerification: true,
      transferReportedByUid: user.uid,
      transferReportedAtMs: now,
      updatedAtMs: now,
    });
    tx.set(db.doc(
      `${root}/paymentAudit/${require("node:crypto").randomUUID()}`
    ), {
      action: "transfer_reported", bookingId,
      actorUid: user.uid, atMs: now,
    });
    return {reported: true};
  });
}

async function verifyTeamReceipt({
  db, user, venueId, bookingId, receivedCents, now = Date.now(),
}) {
  validateUserAndField(user, venueId);
  if (typeof bookingId !== "string" || !/^[a-f0-9]{32}$/.test(bookingId)) {
    throw new Error("Choose a valid booking.");
  }
  policy.cents(receivedCents, false);
  const root = `leagueVenues/${venueId}`;
  const ref = db.doc(`${root}/teamPayments/${bookingId}`);

  return db.runTransaction(async tx => {
    const context = await loadBankingContext(tx, db, venueId, user);
    if (!context.isAdmin) {
      throw new Error("Only a Field administrator can confirm receipt.");
    }
    const snapshot = await tx.get(ref);
    const booking = snapshot.data();
    if (!booking || booking.venueId !== venueId ||
        booking.status === "cancelled") {
      throw new Error("This booking is unavailable.");
    }
    const previous = booking.amountPaidCents || 0;
    if (receivedCents < previous || receivedCents > booking.amountDueCents) {
      throw new Error("Received total cannot decrease or exceed the booking total.");
    }
    if (receivedCents === previous) {
      if (booking.awaitingVerification) {
        throw new Error("Enter the increased total received before confirming.");
      }
      return {verified: true};
    }

    const status = receivedCents === booking.amountDueCents ? "paid" : "part_paid";
    const receiptId = require("node:crypto").randomUUID();
    tx.update(ref, {
      amountPaidCents: receivedCents,
      status,
      awaitingVerification: false,
      verifiedByUid: user.uid,
      verifiedAtMs: now,
      updatedAtMs: now,
    });
    tx.set(db.doc(`${root}/teamPayments/${bookingId}/receipts/${receiptId}`), {
      amountCents: receivedCents - previous,
      cumulativeReceivedCents: receivedCents,
      verifiedByUid: user.uid,
      verifiedAtMs: now,
      method: "field_bank_transfer",
    });
    tx.set(db.doc(`${root}/paymentAudit/${receiptId}`), {
      action: "receipt_confirmed", bookingId,
      actorUid: user.uid, atMs: now,
      beforeCents: previous, receivedCents,
    });
    return {verified: true};
  });
}

async function signupDirectory({
  db, user, venueId, clubId = "",
}) {
  const access = await signupView({db, user, venueId, clubId});
  if (!access.canBook && !access.canManageBanking) {
    throw new Error("Sign in as a registered Club leader or Field staff.");
  }
  const snapshot = await db.collection("clubFieldMemberships")
    .where("venueId", "==", venueId).get();
  const ids = [...new Set(snapshot.docs.filter(doc =>
    doc.data().status === "active" &&
    /^[A-Za-z0-9_-]{1,150}$/.test(doc.id)
  ).map(doc => doc.id))];
  const clubs = [];

  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const profiles = await db.getAll(
      ...batch.map(id => db.doc(`clubs/${id}`))
    );
    profiles.forEach((profile, index) => {
      const club = profile.data();
      if (!profile.exists || club.deleted === true ||
          club.status === "deleted") return;
      const id = batch[index];
      const name = String(club.name || club.clubName || id);
      clubs.push({
        id,
        clubId: id,
        fullName: name,
        shortName: name,
        name,
        logoUrl: club.branding?.logoUrl || club.logoUrl || "",
        isCurrent: id === clubId,
      });
    });
  }
  const context = await loadBankingContext(db, db, venueId, user);
  const season = policy.availableSeason(context.venue);
  const payments = await db.collection(
    `leagueVenues/${venueId}/teamPayments`
  ).get();
  const bookings = payments.docs.map(doc => doc.data())
    .filter(booking => booking.status !== "cancelled");

  const signupRecords = clubs.map(club => {
    const selected = new Set();
    const paid = new Set();
    bookings.filter(booking => booking.clubId === club.id).forEach(booking => {
      let dates = [];
      if (booking.kind === "matchDay") {
        dates = [booking.date];
      } else if (season && booking.seasonId === season.id) {
        dates = season.fixtures.filter(fixture =>
          [fixture.clubAId, fixture.clubBId].includes(club.id)
        ).map(fixture => {
          const day = (season.matchDays || []).find(
            item => item.id === fixture.matchDayId
          );
          return String(
            fixture.scheduledLocal || day?.dateLocal || ""
          ).slice(0, 10);
        });
      }
      dates.filter(Boolean).forEach(date => {
        selected.add(date);
        if (booking.status === "paid") paid.add(date);
      });
    });
    return {
      docId: club.id,
      data: {
        beneficiaryPlayerId: club.id,
        playerId: club.id,
        userId: club.id,
        beneficiaryName: club.fullName,
        beneficiaryShortName: club.shortName,
        playerName: club.fullName,
        shortName: club.shortName,
        beneficiaryType: "self",
        selectedWeeks: [...selected].sort(),
        paidWeeks: [...paid].sort(),
      },
    };
  });
  return {
    ...access,
    clubs: clubs.sort((a, b) => a.name.localeCompare(b.name)),
    signupRecords,
  };
}

async function saveFieldBookingSettings({
  db, user, venueId, settings, now = Date.now(),
}) {
  validateUserAndField(user, venueId);
  const maxPlayers = settings?.maxPlayers;
  const fee = settings?.lateBookingFee?.feePerGame;
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 100) {
    throw new Error("Choose a Club limit between 1 and 100.");
  }
  if (typeof fee !== "number" || !Number.isFinite(fee) ||
      fee < 0 || fee > 1000 ||
      Math.abs(fee * 100 - Math.round(fee * 100)) > 0.000001) {
    throw new Error("Enter a late booking fee with up to two decimal places.");
  }
  const {normalizeLateBookingPolicy} = await import("./lateBookingPolicy.mjs");
  const lateBookingFee = normalizeLateBookingPolicy({
    enabled: settings.lateBookingFee.enabled === true,
    feePerGame: fee,
    deadlineDay: 30,
  });

  return db.runTransaction(async tx => {
    const context = await loadBankingContext(tx, db, venueId, user);
    if (!context.isAdmin) {
      throw new Error("Only a Field administrator can change booking settings.");
    }
    const root = `leagueVenues/${venueId}`;
    const bookingSettings = {
      ...(context.venue.bookingSettings || {}),
      maxPlayers,
      lateBookingFee,
    };
    tx.update(db.doc(root), {bookingSettings, updatedAtMs: now});
    tx.set(db.doc(
      `${root}/paymentAudit/${require("node:crypto").randomUUID()}`
    ), {
      action: "booking_settings_updated",
      actorUid: user.uid,
      bookingSettings,
      createdAtMs: now,
    });
    return {bookingSettings};
  });
}

async function operate({db, user, body = {}}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Provide a valid banking request.");
  }
  const args = {
    db, user, venueId: body.venueId,
  };
  switch (body.action) {
  case "leagueEntryView":
    return require("./fieldLeagueEntryReceipt").view({
      ...args, seasonId: body.seasonId, loadContext: loadBankingContext,
    });
  case "confirmLeagueEntry":
    return require("./fieldLeagueEntryReceipt").confirm({
      ...args, seasonId: body.seasonId, clubId: body.clubId,
      expectedAmountCents: body.expectedAmountCents,
      loadContext: loadBankingContext,
    });
  case "saveBookingSettings":
    return saveFieldBookingSettings({...args, settings: body.settings});
  case "signupDirectory":
    return signupDirectory({...args, clubId: body.clubId || ""});
  case "verify":
    return verifyTeamReceipt({...args, bookingId: body.bookingId,
      receivedCents: body.receivedCents});
  case "report":
    return reportTeamTransfer({...args, bookingId: body.bookingId});
  case "paymentView":
    return paymentView({...args, clubId: body.clubId || ""});
  case "book":
    return createTeamBooking({db, user, body});
  case "signupView":
    return signupView({...args, clubId: body.clubId || ""});
  case "view":
  case "bankingInbox":
    return bankingView(args);
  case "saveSettings":
    return saveBankingSettings({
      ...args, settings: body.settings,
      expectedRevision: body.expectedRevision,
    });
  case "reviewSettings":
    return reviewBankingSettings({
      ...args, requestId: body.requestId, decision: body.decision,
    });
  default:
    throw new Error("Choose a valid banking operation.");
  }
}

module.exports = {
  loadBankingContext, bankingView,
  saveBankingSettings, reviewBankingSettings, signupView,
  createTeamBooking, paymentView, reportTeamTransfer,
  verifyTeamReceipt, signupDirectory, saveFieldBookingSettings, operate,
};
