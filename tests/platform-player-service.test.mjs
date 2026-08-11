import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlatformPlayerSnapshot,
  shouldCreatePlatformPlayer,
  shouldLinkMembershipToPlatformPlayer,
  mergePlatformIdentity,
  evaluatePlatformPlayerState,
} from "../src/core/platformPlayer/platformPlayerService.js";

test("snapshot prefers authenticated uid/email", () => {
  const snapshot = buildPlatformPlayerSnapshot({
    authenticatedUser: {
      uid: "auth-123",
      email: " USER@MAIL.COM ",
      displayName: "Auth Name",
    },
    reusableProfile: {
      uid: "old-uid",
      email: "old@mail.com",
      fullName: "Profile Name",
    },
  });

  assert.equal(snapshot.uid, "auth-123");
  assert.equal(snapshot.email, "user@mail.com");
  assert.equal(snapshot.fullName, "Profile Name");
});

test("snapshot prefers richer reusable photo and phone", () => {
  const snapshot = buildPlatformPlayerSnapshot({
    authenticatedUser: {
      uid: "auth-123",
      email: "user@mail.com",
    },
    reusableProfile: {
      fullName: "Player One",
      photoData: "photo-data",
      whatsappNumber: "0821234567",
    },
  });

  assert.equal(snapshot.photoUrl, "photo-data");
  assert.equal(snapshot.whatsappNumber, "0821234567");
});

test("platform player can be created with uid and email", () => {
  assert.equal(
    shouldCreatePlatformPlayer({
      uid: "uid-1",
      email: "a@b.com",
    }),
    true
  );
});

test("platform player is not created without uid", () => {
  assert.equal(
    shouldCreatePlatformPlayer({
      email: "a@b.com",
    }),
    false
  );
});

test("membership link requires matching email", () => {
  assert.equal(
    shouldLinkMembershipToPlatformPlayer({
      platformPlayer: {
        email: "PLAYER@gmail.com",
      },
      member: {
        email: "player@gmail.com",
      },
    }),
    true
  );
});

test("membership link rejects different email", () => {
  assert.equal(
    shouldLinkMembershipToPlatformPlayer({
      platformPlayer: {
        email: "one@gmail.com",
      },
      member: {
        email: "two@gmail.com",
      },
    }),
    false
  );
});

test("merge never removes richer existing values", () => {
  const merged = mergePlatformIdentity({
    existingPlatformPlayer: {
      uid: "uid-1",
      email: "player@gmail.com",
      fullName: "Player One",
      photoUrl: "photo",
      whatsappNumber: "0821234567",
    },
    incomingSnapshot: {
      uid: "uid-1",
      email: "player@gmail.com",
      fullName: "",
      photoUrl: "",
      whatsappNumber: "",
    },
  });

  assert.equal(merged.photoUrl, "photo");
  assert.equal(merged.whatsappNumber, "0821234567");
});

test("state evaluator reports completeness", () => {
  const state = evaluatePlatformPlayerState({
    uid: "uid-1",
    email: "player@gmail.com",
    fullName: "Player One",
  });

  assert.equal(state.hasIdentityKey, true);
  assert.equal(state.hasEmail, true);
  assert.equal(state.complete, true);
});
