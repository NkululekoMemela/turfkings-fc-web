import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlatformPlayerCandidate,
  planPlatformPlayerWrite,
} from "../src/core/platformPlayer/platformPlayerManager.js";


test("candidate uses authenticated identity and richer reusable profile", () => {
  const candidate =
    buildPlatformPlayerCandidate({
      authenticatedUser: {
        uid: "uid-123",
        email: "PLAYER@GMAIL.COM",
      },
      reusableProfile: {
        fullName: "Player One",
        photoData: "photo-data",
        whatsappNumber: "0821234567",
      },
    });

  assert.equal(candidate.uid, "uid-123");
  assert.equal(
    candidate.email,
    "player@gmail.com"
  );
  assert.equal(
    candidate.fullName,
    "Player One"
  );
  assert.equal(
    candidate.photoUrl,
    "photo-data"
  );
  assert.equal(
    candidate.whatsappNumber,
    "0821234567"
  );
});


test("plans CREATE when Platform Player does not exist", () => {
  const plan = planPlatformPlayerWrite({
    authenticatedUser: {
      uid: "uid-1",
      email: "player@gmail.com",
    },
    reusableProfile: {
      fullName: "Player One",
    },
  });

  assert.equal(plan.action, "CREATE");
  assert.equal(plan.safeToWrite, true);
  assert.equal(plan.documentId, "uid-1");
  assert.equal(
    plan.payload.email,
    "player@gmail.com"
  );
});


test("plans BLOCKED without authenticated uid", () => {
  const plan = planPlatformPlayerWrite({
    authenticatedUser: {
      email: "player@gmail.com",
    },
    reusableProfile: {
      fullName: "Player One",
    },
  });

  assert.equal(plan.action, "BLOCKED");
  assert.equal(plan.safeToWrite, false);
  assert.equal(plan.payload, null);
});


test("plans BLOCKED without verified email", () => {
  const plan = planPlatformPlayerWrite({
    authenticatedUser: {
      uid: "uid-1",
    },
    reusableProfile: {
      fullName: "Player One",
    },
  });

  assert.equal(plan.action, "BLOCKED");
  assert.equal(plan.safeToWrite, false);
});


test("blocks conflicting Platform Player email", () => {
  const plan = planPlatformPlayerWrite({
    existingPlatformPlayer: {
      uid: "uid-1",
      email: "someoneelse@gmail.com",
      fullName: "Player One",
    },
    authenticatedUser: {
      uid: "uid-1",
      email: "player@gmail.com",
    },
    reusableProfile: {
      fullName: "Player One",
    },
  });

  assert.equal(plan.action, "BLOCKED");
  assert.equal(plan.safeToWrite, false);

  assert.match(
    plan.reason,
    /email conflicts/i
  );
});


test("plans MERGE when incoming data enriches existing identity", () => {
  const plan = planPlatformPlayerWrite({
    existingPlatformPlayer: {
      uid: "uid-1",
      email: "player@gmail.com",
      fullName: "Player One",
      photoUrl: "",
      whatsappNumber: "",
    },
    authenticatedUser: {
      uid: "uid-1",
      email: "player@gmail.com",
    },
    reusableProfile: {
      fullName: "Player One",
      photoData: "better-photo",
      whatsappNumber: "0821234567",
    },
  });

  assert.equal(plan.action, "MERGE");
  assert.equal(plan.safeToWrite, true);
  assert.equal(
    plan.payload.photoUrl,
    "better-photo"
  );
  assert.equal(
    plan.payload.whatsappNumber,
    "0821234567"
  );
});


test("plans NONE when existing identity already contains available data", () => {
  const plan = planPlatformPlayerWrite({
    existingPlatformPlayer: {
      uid: "uid-1",
      email: "player@gmail.com",
      fullName: "Player One",
      photoUrl: "photo",
      whatsappNumber: "0821234567",
    },
    authenticatedUser: {
      uid: "uid-1",
      email: "player@gmail.com",
    },
    reusableProfile: {
      fullName: "Player One",
      photoData: "photo",
      whatsappNumber: "0821234567",
    },
  });

  assert.equal(plan.action, "NONE");
  assert.equal(plan.safeToWrite, true);
  assert.equal(plan.payload, null);
});


test("existing richer data is never erased by poorer incoming snapshot", () => {
  const plan = planPlatformPlayerWrite({
    existingPlatformPlayer: {
      uid: "uid-1",
      email: "player@gmail.com",
      fullName: "Player One",
      photoUrl: "existing-photo",
      whatsappNumber: "0821234567",
    },
    authenticatedUser: {
      uid: "uid-1",
      email: "player@gmail.com",
    },
    reusableProfile: {
      fullName: "Player One",
    },
  });

  assert.equal(plan.action, "NONE");
  assert.equal(plan.safeToWrite, true);
});
