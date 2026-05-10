const admin = require("firebase-admin");

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "turfkings-staging";
const MASTER_EMAIL = "nkululekolerato@gmail.com";
const LEGACY_EMAILS = ["nkululeko.memela0205@gmail.com"];
const EXECUTE = process.argv.includes("--execute");
const CONFIRM = process.argv.includes("--confirm");
const DRY_RUN = !(EXECUTE && CONFIRM);

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

function cleanEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function uniqueEmails(values = []) {
  return [...new Set(values.map(cleanEmail).filter(Boolean))];
}

async function main() {
  console.log("\nNORMALIZE CLUB ADMINS");
  console.log("Project:", PROJECT_ID);
  console.log("Mode:", DRY_RUN ? "DRY RUN" : "EXECUTE");
  console.log("Master email:", MASTER_EMAIL);

  const snap = await db.collection("clubs").get();

  for (const doc of snap.docs) {
    const clubId = doc.id;
    const d = doc.data();

    const existingAdminEmails = Array.isArray(d.adminEmails) ? d.adminEmails : [];
    const existingCaptainEmails = Array.isArray(d.captainEmails) ? d.captainEmails : [];

    const knownEmails = uniqueEmails([
      d.createdBy,
      d.createdByEmail,
      d.ownerEmail,
      d.adminEmail,
      d.captainEmail,
      d?.captain?.email,
      ...existingAdminEmails,
      ...existingCaptainEmails,
    ]);

    const appearsOwnedByYou =
      knownEmails.includes(cleanEmail(MASTER_EMAIL)) ||
      LEGACY_EMAILS.some((email) => knownEmails.includes(cleanEmail(email)));

    if (!appearsOwnedByYou && clubId !== "turf-kings") {
      console.log(`\nSKIP ${clubId} — no matching owner/admin/captain email`);
      continue;
    }

    const nextAdminEmails = uniqueEmails([
      ...existingAdminEmails,
      MASTER_EMAIL,
      ...LEGACY_EMAILS,
    ]);

    const nextCaptainEmails = uniqueEmails([
      ...existingCaptainEmails,
      d?.captain?.email,
      d.captainEmail,
      MASTER_EMAIL,
      ...LEGACY_EMAILS,
    ]);

    console.log(`\n${DRY_RUN ? "WOULD UPDATE" : "UPDATE"} ${clubId}`);
    console.log("name:", d.name);
    console.log("adminEmails:", nextAdminEmails);
    console.log("captainEmails:", nextCaptainEmails);

    if (!DRY_RUN) {
      await doc.ref.set(
        {
          adminEmails: nextAdminEmails,
          captainEmails: nextCaptainEmails,
          superAdminEmails: uniqueEmails([MASTER_EMAIL]),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.doc(`clubs/${clubId}/members/${MASTER_EMAIL}`).set(
        {
          email: MASTER_EMAIL,
          role: clubId === "turf-kings" ? "admin" : "captain",
          status: "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: "normalizeClubAdmins_2026_05_10",
        },
        { merge: true }
      );
    }
  }

  console.log("\nDONE");
  console.log(DRY_RUN ? "No writes made." : "Admin normalization complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
