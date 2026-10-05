const {randomUUID} = require("node:crypto");

const ITEMS = "fieldLostFoundItems";
const CLAIMS = "fieldLostFoundClaims";
const MAX_PHOTO = 512 * 1024;

function identifier(value) {
  const result = String(value || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(result)) {
    throw new Error("Choose a valid Field or report.");
  }
  return result;
}
function text(value, max, required = true) {
  const result = String(value || "").trim();
  if ((required && result.length < 3) || result.length > max) {
    throw new Error("Please complete the description within the displayed limit.");
  }
  return result;
}
function date(value) {
  const result = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) ||
      !Number.isFinite(Date.parse(result + "T00:00:00Z")) ||
      new Date(result + "T00:00:00Z").toISOString().slice(0, 10) !== result) {
    throw new Error("Choose a valid date.");
  }
  return result;
}
function photoBuffer(value) {
  if (!value) return null;
  if (typeof value !== "string" ||
      value.length > Math.ceil(MAX_PHOTO * 4 / 3) + 40 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value)) {
    throw new Error("Choose a JPEG photo smaller than 512 KB.");
  }
  const buffer = Buffer.from(value.split(",")[1], "base64");
  if (buffer.length < 4 || buffer.length > MAX_PHOTO ||
      buffer[0] !== 255 || buffer[1] !== 216 ||
      buffer[buffer.length - 2] !== 255 ||
      buffer[buffer.length - 1] !== 217) {
    throw new Error("The photo is not a valid JPEG.");
  }
  return buffer;
}
function bucket(db) {
  const {getStorage} = require("firebase-admin/storage");
  const project = db.app.options.projectId || process.env.GCLOUD_PROJECT;
  const configured = db.app.options.storageBucket;
  if (!configured && ![
    "five-asides-near-me-staging", "five-asides-near-me",
  ].includes(project)) {
    throw new Error("Private photo storage is not configured.");
  }
  return getStorage(db.app).bucket(
    configured || `${project}.firebasestorage.app`
  );
}
function safeClaim(id, data) {
  return {
    id, description: data.description, details: data.details,
    place: data.place, date: data.date, status: data.status,
    createdAtMs: data.createdAtMs,
    itemType: data.itemType || "",
    colour: data.colour || "",
    size: data.size || "",
    specifics: data.specifics || "",
    response: data.response || "",
    responseOutcome: data.responseOutcome || "",
    respondedAtMs: data.respondedAtMs || null,
    closedAtMs: data.closedAtMs || null,
    open: !["closed", "collected"].includes(data.status),
  };
}
async function operate({db, user, body = {}, photoBucket}) {
  if (!user?.uid || user.cameraSession === true ||
      user.cameraSessionId || user.cameraHandoffId) {
    throw new Error("Sign in with your own account.");
  }
  const venueId = identifier(body.venueId);
  const [venue, staff] = await db.getAll(
    db.doc(`leagueVenues/${venueId}`),
    db.doc(`leagueVenues/${venueId}/staff/${user.uid}`)
  );
  if (!venue.exists) throw new Error("This Field is unavailable.");
  const staffData = staff.data() || {};
  const admin = venue.data().ownerUid === user.uid ||
    (staffData.status === "active" && staffData.isAdministrator === true &&
      String(staffData.role || "").trim().toLowerCase() !== "referee");
  const requireAdmin = () => {
    if (!admin) throw new Error("Only the Field admin team can do this.");
  };
  let action = String(body.action || "view");
  const playerView = body.asPlayer === true;
  const managingView = admin && !playerView;

  if (action === "summary") {
    const query = managingView ?
      db.collection(CLAIMS).where("venueId", "==", venueId) :
      db.collection(CLAIMS).where("claimantUid", "==", user.uid);
    const snapshot = await query.select("venueId", "status").get();
    return {
      openCount: snapshot.docs.filter(doc => {
        const data = doc.data();
        return data.venueId === venueId &&
          !["closed", "collected"].includes(data.status);
      }).length,
    };
  }

  if (action === "respond") {
    requireAdmin();
    if (body.outcome === "found") {
      action = "approve";
    } else if (body.outcome === "not_found") {
      const claimRef = db.collection(CLAIMS).doc(identifier(body.claimId));
      await db.runTransaction(async tx => {
        const snap = await tx.get(claimRef);
        const claim = snap.data();
        if (!claim || claim.venueId !== venueId ||
            !["pending", "responded"].includes(claim.status)) {
          throw new Error("This ticket cannot receive that response.");
        }
        tx.update(claimRef, {
          status: "responded", responseOutcome: "not_found",
          response: "Sorry, we have not found your item in our collection yet. " +
            "We will look around the Field and let you know if it turns up.",
          respondedAtMs: Date.now(), reviewedByUid: user.uid,
        });
      });
      return {ok: true};
    } else {
      throw new Error("Choose a response.");
    }
  }

  if (action === "view") {
    const query = managingView ?
      db.collection(CLAIMS).where("venueId", "==", venueId) :
      db.collection(CLAIMS).where("claimantUid", "==", user.uid);
    const claims = (await query.get()).docs
      .filter(doc => doc.data().venueId === venueId)
      .map(doc => ({
        ...safeClaim(doc.id, doc.data()),
        ...(managingView ? {claimantName: doc.data().claimantName} : {}),
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
    const items = managingView ?
      (await db.collection(ITEMS).where("venueId", "==", venueId).get())
        .docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id, description: data.description,
            details: data.details, place: data.place, date: data.date,
            status: data.status, hasPhoto: Boolean(data.photoPath),
            createdAtMs: data.createdAtMs,
          };
        }).sort((a, b) => b.createdAtMs - a.createdAtMs) : [];
    return {
      canManage: managingView, claims, items,
      openCount: claims.filter(claim => claim.open).length,
    };
  }

  if (action === "claim" || action === "found") {
    if (action === "found") requireAdmin();
    const short = (value, max, required = false) => {
      const result = String(value || "").trim();
      if (result.length > max || (required && !result)) {
        throw new Error("Complete the item questions.");
      }
      return result;
    };
    const itemType = short(body.itemType, 60);
    const colour = short(body.colour, 80, Boolean(itemType));
    const size = short(body.size, 80, itemType === "Footwear");
    const specifics = short(body.specifics, 240);
    const data = {
      itemType, colour, size, specifics,
      venueId,
      description: text(body.description, 160),
      details: text(body.details, 700),
      place: text(body.place, 160),
      date: date(body.date),
      createdAtMs: Date.now(),
    };
    if (action === "claim") {
      const id = randomUUID();
      await db.collection(CLAIMS).doc(id).create({
        ...data, claimantUid: user.uid,
        claimantName: String(user.name || user.email || "Field visitor").slice(0, 160),
        status: "pending",
      });
      return {id};
    }
    const id = randomUUID();
    const buffer = photoBuffer(body.photo);
    const photoPath = buffer ? `fieldLostFoundPhotos/${venueId}/${id}.jpg` : "";
    let file;
    if (buffer) {
      file = (photoBucket || bucket(db)).file(photoPath);
      await file.save(buffer, {
        resumable: false,
        metadata: {
          contentType: "image/jpeg",
          cacheControl: "private, no-store",
        },
      });
    }
    try {
      await db.collection(ITEMS).doc(id).create({
        ...data, recordedByUid: user.uid, status: "available", photoPath,
      });
    } catch (error) {
      if (file) await file.delete().catch(() => {});
      throw error;
    }
    return {id};
  }

  if (action === "approve" || action === "close" || action === "collect") {
    requireAdmin();
    const claimRef = db.collection(CLAIMS).doc(identifier(body.claimId));
    await db.runTransaction(async tx => {
      const claimSnap = await tx.get(claimRef);
      if (!claimSnap.exists || claimSnap.data().venueId !== venueId) {
        throw new Error("Report unavailable.");
      }
      const claim = claimSnap.data();
      if (action === "close") {
        if (!["responded", "approved"].includes(claim.status)) {
          throw new Error("Respond to the ticket before closing it.");
        }
        tx.update(claimRef, {
          status: "closed", closedAtMs: Date.now(),
          reviewedByUid: user.uid, reviewedAtMs: Date.now(),
        });
        return;
      }
      const itemId = action === "collect" ? claim.itemId : identifier(body.itemId);
      if (!itemId) throw new Error("Choose the matching found item.");
      const itemRef = db.collection(ITEMS).doc(itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists || itemSnap.data().venueId !== venueId) {
        throw new Error("Found item unavailable.");
      }
      const item = itemSnap.data();
      if (action === "approve") {
        if (!["pending", "responded"].includes(claim.status) ||
            item.status !== "available") {
          throw new Error("This report or item has already been processed.");
        }
        if (body.action === "respond" && !item.photoPath) {
          throw new Error("Record a photo for the found item before sending it.");
        }
        tx.update(itemRef, {
          status: "reserved", claimId: claimRef.id,
          reviewedByUid: user.uid, reviewedAtMs: Date.now(),
        });
        tx.update(claimRef, {
          status: "approved", itemId, reviewedByUid: user.uid,
          responseOutcome: "found",
          response: "We have an item matching your description. " +
            "Please check the photo and contact the Field team to arrange collection.",
          respondedAtMs: Date.now(), reviewedAtMs: Date.now(),
        });
      } else {
        if (!["approved", "closed"].includes(claim.status) ||
            item.claimId !== claimRef.id ||
            item.status !== "reserved") {
          throw new Error("Verify ownership before recording collection.");
        }
        tx.update(itemRef, {status: "collected", collectedAtMs: Date.now()});
        tx.update(claimRef, {
          status: "collected", collectedAtMs: Date.now(), closedAtMs: Date.now(),
        });
      }
    });
    return {ok: true};
  }

  if (action === "photo") {
    let itemId;
    if (admin && body.itemId) {
      itemId = identifier(body.itemId);
    } else {
      const claim = await db.collection(CLAIMS).doc(identifier(body.claimId)).get();
      const data = claim.data();
      if (!data || data.venueId !== venueId || data.claimantUid !== user.uid ||
          !["approved", "collected", "closed"].includes(data.status) ||
          !data.itemId) {
        throw new Error("The Field team must verify ownership first.");
      }
      itemId = identifier(data.itemId);
    }
    const item = await db.collection(ITEMS).doc(itemId).get();
    if (!item.exists || item.data().venueId !== venueId) {
      throw new Error("Photo unavailable.");
    }
    const expected = `fieldLostFoundPhotos/${venueId}/${itemId}.jpg`;
    if (item.data().photoPath !== expected) return {photo: null};
    const [buffer] = await (photoBucket || bucket(db)).file(expected).download();
    if (buffer.length > MAX_PHOTO) throw new Error("Photo unavailable.");
    return {photo: `data:image/jpeg;base64,${buffer.toString("base64")}`};
  }
  throw new Error("Unknown Lost & Found action.");
}
exports.operate = operate;
