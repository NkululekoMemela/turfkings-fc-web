const service = require("./fieldSeasonSquadService");
const FEE = 7900;

exports.checkout = async ({
  db, admin, req, body, FieldValue, secret, baseUrl,
  fetchJson, buildYocoCheckoutPayload, resolveCheckoutUrlSet,
}) => {
  if (body.clubId !== "turf-kings") {
    throw new Error("Online collection is currently available for Turf Kings only.");
  }
  const bearer = String(req.headers.authorization || "");
  if (!bearer.startsWith("Bearer ")) throw new Error("Sign in first.");
  const user = await admin.auth().verifyIdToken(bearer.slice(7), true);
  const scope = {
    venueId: body.venueId, seasonId: body.seasonId, clubId: body.clubId,
  };
  service.squadId(scope);
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(body.memberId || "")) {
    throw new Error("Choose a valid squad member.");
  }

  const paymentRef = db.collection("payments").doc();
  const prepared = await db.runTransaction(async tx => {
    const context = await service.loadContext(tx, db, scope);
    const entry = context.squad?.entries?.[body.memberId];
    if (!entry || entry.invitationStatus !== "accepted") {
      throw new Error("Accept your season invitation before paying.");
    }
    const [member, player] = await tx.getAll(
      context.clubRef.collection("members").doc(body.memberId),
      context.clubRef.collection("players").doc(entry.sourcePlayerId)
    );
    if (!service.ownsMember(member.data(), user) ||
        member.data()?.playerId !== entry.sourcePlayerId ||
        !player.exists || (player.data().status || "active") !== "active") {
      throw new Error("Only the invited Club member can pay this booking.");
    }
    if (entry.seasonCheckoutPaymentId) {
      const previous = await tx.get(db.collection("payments")
        .doc(entry.seasonCheckoutPaymentId));
      const saved = previous.data();
      if (saved?.status === "checkout_created" && saved.redirectUrl) {
        return {redirectUrl: saved.redirectUrl};
      }
      if (saved?.status === "initializing") {
        throw new Error("Checkout is being prepared. Please retry shortly.");
      }
    }
    const contributionCents = entry.paymentStatus === "paid"
      ? 0 : entry.contributionCents;
    const platformFeeCents = entry.platformFeePaymentStatus === "paid" ? 0 : FEE;
    if (!Number.isSafeInteger(contributionCents) || contributionCents < 0) {
      throw new Error("Invalid agreed contribution.");
    }
    const totalCents = contributionCents + platformFeeCents;
    if (!totalCents) throw new Error("Your season booking is already paid.");
    tx.set(paymentRef, {
      purpose: "field_season", provider: "yoco", status: "initializing",
      ...scope, activeClubId: scope.clubId, memberId: body.memberId,
      sourcePlayerId: entry.sourcePlayerId, userId: user.uid,
      displayName: entry.fullName, currency: "ZAR",
      contributionCents, platformFeeCents, totalCents,
      amountRequested: totalCents / 100,
      amountRequestedBaseUnits: totalCents,
      paymentReference: `season-${paymentRef.id}`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(context.squadRef, {
      entries: {...context.squad.entries, [body.memberId]: {
        ...entry, seasonCheckoutPaymentId: paymentRef.id,
      }},
    });
    return {totalCents};
  });

  if (prepared.redirectUrl) return {ok: true, ...prepared};
  try {
    const urls = resolveCheckoutUrlSet({}, paymentRef.id);
    const payload = buildYocoCheckoutPayload({
      paymentRecordId: paymentRef.id,
      amountInBaseUnits: prepared.totalCents,
      referenceLabel: `season-${paymentRef.id}`,
      ...urls,
      metadata: {paymentRecordId: paymentRef.id, purpose: "field_season"},
    });
    const response = await fetchJson(
      `${baseUrl.replace(/\/$/, "")}/api/checkouts`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }, 15000
    );
    const result = response.data || {};
    const redirectUrl = result.redirectUrl || result.redirectURL || result.url;
    if (!response.ok || !redirectUrl) {
      throw new Error("Checkout could not be prepared. Please try again.");
    }
    await db.runTransaction(async tx => {
      const saved = await tx.get(paymentRef);
      tx.update(paymentRef, {
        status: saved.data()?.status === "paid" ? "paid" : "checkout_created",
        yocoCheckoutId: result.id || result.checkoutId || "",
        redirectUrl, updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return {ok: true, redirectUrl};
  } catch (error) {
    await db.runTransaction(async tx => {
      const saved = await tx.get(paymentRef);
      if (saved.data()?.status !== "paid") {
        tx.update(paymentRef, {
          status: "failed", updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    throw error;
  }
};

exports.settle = async ({db, paymentRef, receivedCents, FieldValue}) =>
  db.runTransaction(async tx => {
    const snap = await tx.get(paymentRef);
    const payment = snap.data();
    if (!payment || payment.purpose !== "field_season") {
      throw new Error("Invalid season payment.");
    }
    if (payment.status === "paid") return;
    if (!Number.isSafeInteger(receivedCents) ||
        receivedCents !== payment.totalCents) {
      throw new Error("Verified payment does not match the season bill.");
    }
    const scope = {
      venueId: payment.venueId, seasonId: payment.seasonId,
      clubId: payment.clubId,
    };
    const squadRef = db.collection("leagueSeasonSquads")
      .doc(service.squadId(scope));
    const squadSnap = await tx.get(squadRef);
    const squad = squadSnap.data();
    const entry = squad?.entries?.[payment.memberId];
    if (!entry || entry.sourcePlayerId !== payment.sourcePlayerId ||
        entry.seasonCheckoutPaymentId !== paymentRef.id ||
        entry.invitationStatus !== "accepted") {
      throw new Error("The payment's season booking requires review.");
    }
    if ((payment.contributionCents > 0 &&
          (entry.paymentStatus === "paid" ||
           payment.contributionCents !== entry.contributionCents)) ||
        (payment.platformFeeCents > 0 &&
          (payment.platformFeeCents !== FEE ||
           entry.platformFeePaymentStatus === "paid"))) {
      throw new Error("The payment's contribution requires review.");
    }
    const next = {...entry};
    if (payment.contributionCents > 0) {
      next.paymentStatus = "paid";
      next.paidCents = payment.contributionCents;
      next.paymentConfirmedByUid = payment.userId;
      next.paymentConfirmedAtMs = Date.now();
      tx.set(squadRef.collection("paymentConfirmations").doc(payment.memberId), {
        ...scope, memberId: payment.memberId,
        sourcePlayerId: payment.sourcePlayerId,
        amountCents: payment.contributionCents, currency: "ZAR",
        confirmedByUid: payment.userId,
        confirmedAt: FieldValue.serverTimestamp(),
        method: "verified_yoco", paymentRecordId: paymentRef.id,
      });
    }
    if (payment.platformFeeCents > 0) {
      next.platformFeePaymentStatus = "paid";
      next.platformFeePaidCents = FEE;
      tx.set(squadRef.collection("platformFeeConfirmations")
        .doc(payment.memberId), {
        ...scope, memberId: payment.memberId, amountCents: FEE,
        currency: "ZAR", paymentRecordId: paymentRef.id,
        confirmedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(squadRef, {
      entries: {...squad.entries, [payment.memberId]: next},
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(paymentRef, {
      status: "paid", verifiedBy: "yoco_webhook",
      amountReceived: receivedCents / 100,
      settledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
