import test from "node:test";
import fs from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc,
} from "firebase/firestore";

let env;
const club = ["clubs", "club-one"];
const member = (id) => [...club, "members", id];
const context = (uid, email) =>
  env.authenticatedContext(uid, {
    email,
    email_verified: true,
  }).firestore();

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-fanm-club-membership",
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, ...club), {
      id: "club-one",
      name: "Club One",
      ownerUid: "owner",
      createdByUid: "owner",
      adminUids: ["owner"],
      adminEmails: ["owner@example.com"],
    });
    await setDoc(doc(db, ...member("existing")), {
      fullName: "Existing Player",
      email: "existing@example.com",
      uid: "existing",
      role: "player",
      status: "active",
    });
  });
});

test.after(async () => {
  await env?.cleanup();
});

test("outsider cannot make themselves a Club admin or active member", async () => {
  const outsider = context("outsider", "outsider@example.com");

  await assertFails(updateDoc(doc(outsider, ...club), {
    adminUids: ["owner", "outsider"],
  }));
  await assertFails(updateDoc(doc(outsider, ...club), {
    adminEmails: ["owner@example.com", "outsider@example.com"],
  }));
  await assertFails(updateDoc(doc(outsider, ...club), {
    name: "Impersonated Club",
  }));
  await assertFails(setDoc(doc(outsider, ...member("forged")), {
    fullName: "Outsider",
    email: "outsider@example.com",
    uid: "outsider",
    role: "player",
    status: "active",
  }));
  await assertFails(updateDoc(doc(outsider, ...member("existing")), {
    email: "outsider@example.com",
    uid: "outsider",
  }));
});

test("pending request, admin approval, and own profile edit remain usable", async () => {
  const applicant = context("applicant", "applicant@example.com");
  const owner = context("owner", "owner@example.com");

  await assertSucceeds(setDoc(doc(applicant, ...member("applicant")), {
    fullName: "Applicant One",
    shortName: "Applicant",
    email: "applicant@example.com",
    uid: "applicant",
    role: "player",
    status: "pending",
  }));
  await assertFails(updateDoc(doc(applicant, ...member("applicant")), {
    status: "active",
  }));
  await assertSucceeds(updateDoc(doc(owner, ...member("applicant")), {
    status: "active",
  }));
  await assertSucceeds(updateDoc(doc(applicant, ...member("applicant")), {
    fullName: "Applicant Updated",
    shortName: "Applicant Updated",
  }));
  await assertFails(updateDoc(doc(applicant, ...member("applicant")), {
    role: "admin",
  }));
  await assertSucceeds(getDoc(doc(applicant, ...member("applicant"))));
});

test("Club creator can create the root and initial active captain", async () => {
  const founder = context("founder", "founder@example.com");
  await assertSucceeds(setDoc(doc(founder, "clubs", "new-club"), {
    id: "new-club",
    name: "New Club",
    ownerUid: "founder",
    createdByUid: "founder",
    adminUids: ["founder"],
    adminEmails: ["founder@example.com"],
  }));
  await assertSucceeds(setDoc(
    doc(founder, "clubs", "new-club", "members", "captain"),
    {
      fullName: "Founding Captain",
      email: "founder@example.com",
      uid: "founder",
      role: "admin",
      status: "active",
    },
  ));
});

test("verified player binds an unclaimed Club membership", async () => {
  await env.withSecurityRulesDisabled(async (admin) => {
    await setDoc(doc(admin.firestore(), ...member("unclaimed")), {
      fullName: "Unclaimed Player",
      email: "unclaimed@example.com",
      role: "player",
      status: "active",
    });
  });

  const player = context("unclaimed", "unclaimed@example.com");
  const outsider = context("outsider", "outsider@example.com");

  await assertFails(updateDoc(doc(outsider, ...member("unclaimed")), {
    email: "outsider@example.com",
    uid: "outsider",
    platformIdentityUid: "outsider",
  }));
  await assertSucceeds(updateDoc(doc(player, ...member("unclaimed")), {
    email: "unclaimed@example.com",
    uid: "unclaimed",
    platformIdentityUid: "unclaimed",
  }));
  await assertFails(updateDoc(doc(outsider, ...member("unclaimed")), {
    uid: "outsider",
  }));
});

test("only verified super administrator can soft-delete another Club", async () => {
  const outsider = context("outsider", "outsider@example.com");
  const superAdmin = context("super-admin", "nkululekolerato@gmail.com");

  await assertFails(updateDoc(doc(outsider, ...club), {
    status: "deleted",
    deleted: true,
    deletedByUid: "outsider",
    deletedByEmail: "outsider@example.com",
  }));

  await assertSucceeds(updateDoc(doc(superAdmin, ...club), {
    status: "deleted",
    deleted: true,
    deletedByUid: "super-admin",
    deletedByEmail: "nkululekolerato@gmail.com",
  }));

  await assertFails(updateDoc(doc(superAdmin, ...club), {
    adminUids: ["owner", "super-admin"],
  }));
});
