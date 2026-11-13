const crypto = require("node:crypto");

function input(value, max = 100) {
  return String(value || "").trim().slice(0, max);
}
function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

async function replenish(tx, db, catalog, excludingId = "") {
  const metaRef = db.doc("fieldLogoPoolState/catalog");
  const [meta, available] = await Promise.all([
    tx.get(metaRef),
    tx.get(db.collection("fieldLogoStock").where("status", "==", "available").limit(25)),
  ]);
  const count = available.docs.filter(d => d.id !== excludingId).length;
  let next = meta.data()?.next || 0;
  const additions = [];
  for (let i = count; i < 25 && next < catalog.DESIGN_COUNT; i++, next++) {
    const id = `design-${String(next).padStart(4, "0")}`;
    additions.push({id, spec: catalog.stockSpec(next), status: "available"});
  }
  // Caller must finish all transaction reads before applying these writes.
  return {available: available.docs.filter(d => d.id !== excludingId).map(d => ({id: d.id, ...d.data()})),
    apply() {
      for (const item of additions) tx.create(db.doc(`fieldLogoStock/${item.id}`), item);
      tx.set(metaRef, {next});
    }, additions};
}

function installFieldLogoStudio(exportsObject, {admin, db, onRequest, region}) {
  exportsObject.fieldLogoStudio = onRequest({region, cors: true, timeoutSeconds: 120, memory: "512MiB", maxInstances: 2}, async (req, res) => {
    let uploadedFile;
    try {
      if (req.method !== "POST") return res.status(405).json({ok: false, error: "Use POST."});
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization || "");
      if (!bearer) fail("Sign in before designing a Field logo.", 401);
      let user;
      try { user = await admin.auth().verifyIdToken(bearer[1], true); }
      catch { fail("Your sign-in expired. Sign in again.", 401); }
      if (user.cameraSession === true) fail("Use your Field administrator account.", 403);
      if (typeof req.body?.action === "string" && req.body.action.startsWith("operations")) {
        const {manageFanmOperations} = require("./fanmOperations.cjs");
        const result = await manageFanmOperations({body:req.body,user,admin,db,fail});
        return res.json({ok:true,...result});
      }
      if (req.body?.action === "update") {
        const {updateFieldProfile} = require("./fieldProfileUpdate.cjs");
        const venue = await updateFieldProfile({body:req.body,user,admin,db,fail,replenish});
        return res.json({ok:true,venue});
      }
      if (req.body?.action === "delete") {
        fail("Update FANM and use Archive Field to remove this listing.", 409);
      }
      if (["organizationArchive", "organizationRestore", "organizationArchived", "organizationDelete"].includes(req.body?.action)) {
        const {manageOrganizationArchive} = require("./organizationArchive.cjs");
        const result = await manageOrganizationArchive({
          body: req.body, user, db, fail, stamp: admin.firestore.FieldValue.serverTimestamp,
        });
        return res.json({ok: true, ...result});
      }
      const catalog = await import("./fieldLogoDesigns.mjs");
      if (req.body?.action === "list") {
        const options = await db.runTransaction(async tx => {
          const pool = await replenish(tx, db, catalog);
          pool.apply();
          return [...pool.available, ...pool.additions];
        });
        return res.json({ok: true, options});
      }
      if (req.body?.action !== "register") fail("Choose a valid logo operation.");
      const draft = req.body.draft || {};
      const name = input(draft.name);
      const city = input(draft.city);
      const country = input(draft.country) || "South Africa";
      const firstName = input(draft.staffFirstName);
      const surname = input(draft.staffSurname);
      const email = input(draft.staffEmail, 160).toLowerCase();
      const whatsapp = input(draft.staffWhatsApp, 40);
      const roles = ["field_manager", "assistant_manager", "field_assistant", "other_staff"];
      if (!name || !city || !firstName || !surname || !whatsapp || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.includes(draft.creatorRole)) fail("Complete the Field and staff details first.");
      const website = input(draft.websiteUrl, 300);
      if (website && !/^https?:\/\/[^ ]+\.[^ ]+/i.test(website)) fail("Use a website address beginning with https://.");
      const requestId = input(req.body.requestId, 40);
      if (!/^[a-zA-Z0-9-]{16,40}$/.test(requestId)) fail("Reopen the registration form and try again.");
      const venueId = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35) || "field"}-${user.uid.slice(0, 8)}-${requestId.slice(0, 8)}`;
      const venueRef = db.doc(`leagueVenues/${venueId}`);
      const before = await venueRef.get();
      if (before.exists) {
        if (before.data().ownerUid !== user.uid) fail("This Field belongs to another account.", 403);
        if (before.data().status === "active") return res.json({ok: true, venue: {id: venueId, ...before.data()}});
      }
      const logo = req.body.logo || {};
      let spec = catalog.validSpec(logo.spec) ? logo.spec : catalog.stockSpec(0);
      const stockId = input(logo.stockId, 40);
      let stockRef;
      if (stockId) {
        if (!/^design-\d{4}$/.test(stockId)) fail("Choose a stock logo again.");
        stockRef = db.doc(`fieldLogoStock/${stockId}`);
        const stock = await stockRef.get();
        if (!stock.exists || stock.data().status !== "available") fail("That stock logo was just claimed. Choose another design.", 409);
        // Lettering and colours can change; the claimed artwork stays fixed.
        spec = {...stock.data().spec, palette: spec.palette,
          nameStyle: spec.nameStyle || "auto", lettering: spec.lettering || "full", shortName: spec.shortName || ""};
      }
      let bytes, contentType, extension;
      if (logo.uploadDataUrl) {
        const match = /^data:image\/png;base64,([a-zA-Z0-9+/=]+)$/.exec(logo.uploadDataUrl);
        if (!match) fail("Choose a PNG, JPG or WebP image again.");
        bytes = Buffer.from(match[1], "base64");
        if (bytes.length > 4 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail("The prepared image is invalid or too large.");
        contentType = "image/png";
        extension = "png";
      } else {
        bytes = Buffer.from(catalog.renderFieldLogo(spec, name));
        contentType = "image/svg+xml";
        extension = "svg";
      }
      const token = crypto.randomUUID();
      const file = admin.storage().bucket().file(`leagueVenues/${venueId}/branding/${token}.${extension}`);
      uploadedFile = file;
      await file.save(bytes, {resumable: false, metadata: {contentType, cacheControl:"public,max-age=31536000,immutable", metadata: {firebaseStorageDownloadTokens: token}}});
      const logoUrl = `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
      const coordinate = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
      const latitude = coordinate(draft.latitude);
      const longitude = coordinate(draft.longitude);
      if ((latitude !== null && Math.abs(latitude) > 90) || (longitude !== null && Math.abs(longitude) > 180)) fail("Choose a valid Field location.");
      const {scheduleFromDraft} = require("./fieldProfileUpdate.cjs");
      const timing = scheduleFromDraft(draft, fail);
      const venue = {
        ...timing, schedule: timing,
        id: venueId, name, ownerUid: user.uid, createdByUid: user.uid,
        createdByEmail: user.email || "", createdByName: user.name || `${firstName} ${surname}`,
        creatorRole: draft.creatorRole, adminUids: [user.uid], adminEmails: [String(user.email || email).toLowerCase()],
        location: {city, suburb: input(draft.suburb), address: input(draft.address, 300), province: input(draft.province), country, latitude, longitude, googlePlaceId: input(draft.googlePlaceId, 200)},
        websiteUrl: website, managerContact: {firstName, surname, name: `${firstName} ${surname}`, email, whatsappNumber: whatsapp},
        branding: {logoUrl, carouselLogo: logo.uploadDataUrl && typeof logo.carouselLogo === "string" &&
          logo.carouselLogo.length <= 24000 && /^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(logo.carouselLogo) ? logo.carouselLogo : "", accent: catalog.PALETTES[spec.palette][1], logoSource: logo.uploadDataUrl ? "uploaded_file" : stockId ? "exclusive_stock" : "local_designer", spec, stockId},
        logoUrl, image: logoUrl, visibility: {listed: true}, status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), setupCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const result = await db.runTransaction(async tx => {
        const [existing, deletedId] = await Promise.all([
          tx.get(venueRef), tx.get(db.doc(`deletedFieldIds/${venueId}`)),
        ]);
        if (deletedId.exists) fail("This Field registration was permanently deleted. Start a new registration.", 409);
        if (existing.exists && existing.data().ownerUid !== user.uid) fail("This Field belongs to another account.", 403);
        if (existing.exists && (existing.data().deleted || existing.data().status === "deleted")) {
          fail("This Field was archived. Ask the platform administrator to restore it.", 409);
        }
        if (existing.exists && existing.data().status === "active") return {id: venueId, ...existing.data()};
        let pool;
        if (stockRef) {
          const stock = await tx.get(stockRef);
          if (!stock.exists || stock.data().status !== "available") fail("That stock logo was just claimed. Choose another design.", 409);
          pool = await replenish(tx, db, catalog, stockId);
        }
        tx.set(venueRef, venue);
        tx.set(venueRef.collection("staff").doc(user.uid), {
          uid: user.uid, email: String(user.email || email).toLowerCase(), name: `${firstName} ${surname}`,
          role: draft.creatorRole, status: "active", isAdministrator: true, isCreator: true,
          approvedByUid: user.uid, approvedAt: admin.firestore.FieldValue.serverTimestamp(), createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (stockRef) {
          tx.update(stockRef, {status: "claimed", venueId, claimedByUid: user.uid, claimedAt: admin.firestore.FieldValue.serverTimestamp()});
          pool.apply();
        }
        return venue;
      });
      if (result.logoUrl !== logoUrl) await file.delete().catch(() => {});
      uploadedFile = null;
      return res.json({ok: true, venue: result});
    } catch (error) {
      if (uploadedFile) await uploadedFile.delete().catch(() => {});
      console.error("[FieldLogoStudio]", error.code || "", error.message);
      return res.status(error.status || 500).json({ok: false, error: error.status ? error.message : "Field saving failed. Your design was not claimed. Please try again."});
    }
  });
}
module.exports = {installFieldLogoStudio};
