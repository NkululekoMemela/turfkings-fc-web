import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePlayerIdentityFromCandidates,
} from "../src/core/gpi/identityResolver.js";

import {
  calculateProfileCompleteness,
  selectBestReusableProfile,
} from "../src/core/gpi/profileRankingEngine.js";


test("GPI matches the same email even when names differ", () => {
  const result = resolvePlayerIdentityFromCandidates({
    email: "PLAYER@GMAIL.COM ",
    excludeClubId: "club-b",
    candidates: [
      {
        clubId: "club-a",
        memberId: "member-a",
        fullName: "N. Memela",
        email: "player@gmail.com",
        photoData: "photo-a",
        whatsappNumber: "0820000000",
      },
    ],
  });

  assert.equal(result.matchCount, 1);
  assert.equal(result.bestProfile?.clubId, "club-a");
});


test("GPI excludes the current club", () => {
  const result = resolvePlayerIdentityFromCandidates({
    email: "player@gmail.com",
    excludeClubId: "club-b",
    candidates: [
      {
        clubId: "club-b",
        memberId: "current",
        email: "player@gmail.com",
        photoData: "current-photo",
      },
      {
        clubId: "club-a",
        memberId: "source",
        email: "player@gmail.com",
        photoData: "source-photo",
        whatsappNumber: "0820000000",
      },
    ],
  });

  assert.equal(result.bestProfile?.clubId, "club-a");
});


test("GPI chooses the richer profile", () => {
  const best = selectBestReusableProfile([
    {
      clubId: "club-poor",
      email: "player@gmail.com",
    },
    {
      clubId: "club-rich",
      email: "player@gmail.com",
      fullName: "Player One",
      photoData: "photo",
      whatsappNumber: "0820000000",
      uid: "uid-1",
    },
  ]);

  assert.equal(best?.clubId, "club-rich");
});


test("profile completeness recognises photo and phone", () => {
  const result = calculateProfileCompleteness({
    fullName: "Player One",
    email: "player@gmail.com",
    photoData: "photo",
    whatsappNumber: "0820000000",
    uid: "uid-1",
  });

  assert.equal(result.checks.photo, true);
  assert.equal(result.checks.phone, true);
  assert.equal(result.complete, true);
});


test("different email is never reused", () => {
  const result = resolvePlayerIdentityFromCandidates({
    email: "correct@gmail.com",
    candidates: [
      {
        clubId: "club-a",
        email: "wrong@gmail.com",
        photoData: "photo",
        whatsappNumber: "0820000000",
      },
    ],
  });

  assert.equal(result.matchCount, 0);
  assert.equal(result.bestProfile, null);
});


test("empty email never resolves an identity", () => {
  const result = resolvePlayerIdentityFromCandidates({
    email: "",
    candidates: [
      {
        clubId: "club-a",
        email: "player@gmail.com",
      },
    ],
  });

  assert.equal(result.matchCount, 0);
  assert.equal(result.bestProfile, null);
});
