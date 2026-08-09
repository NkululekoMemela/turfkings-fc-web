import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateProfileReuse,
} from "../src/core/gpi/profileReuseDecision.js";

const candidate = {
  clubId: "club-a",
  memberId: "member-a",
};

test("offers reuse when current club lacks photo and source has photo", () => {
  const result = evaluateProfileReuse({
    sourceCandidate: candidate,
    destinationPhoto: "",
    sourcePhoto: "photo-data",
  });

  assert.equal(result.shouldOfferReuse, true);
  assert.equal(result.canImprovePhoto, true);
});

test("offers reuse when current club lacks phone and source has phone", () => {
  const result = evaluateProfileReuse({
    sourceCandidate: candidate,
    destinationPhone: "",
    sourcePhone: "0821234567",
  });

  assert.equal(result.shouldOfferReuse, true);
  assert.equal(result.canImprovePhone, true);
});

test("offers reuse when both photo and phone can improve", () => {
  const result = evaluateProfileReuse({
    sourceCandidate: candidate,
    destinationPhoto: "",
    destinationPhone: "",
    sourcePhoto: "photo-data",
    sourcePhone: "0821234567",
  });

  assert.equal(result.shouldOfferReuse, true);
  assert.equal(result.canImprovePhoto, true);
  assert.equal(result.canImprovePhone, true);
});

test("does not offer reuse when current profile is already complete", () => {
  const result = evaluateProfileReuse({
    sourceCandidate: candidate,
    destinationPhoto: "existing-photo",
    destinationPhone: "0820000000",
    sourcePhoto: "source-photo",
    sourcePhone: "0821234567",
  });

  assert.equal(result.shouldOfferReuse, false);
});

test("does not offer reuse when source has nothing useful", () => {
  const result = evaluateProfileReuse({
    sourceCandidate: candidate,
    destinationPhoto: "",
    destinationPhone: "",
    sourcePhoto: "",
    sourcePhone: "",
  });

  assert.equal(result.shouldOfferReuse, false);
});

test("does not offer reuse without a source candidate", () => {
  const result = evaluateProfileReuse({
    sourceCandidate: null,
    destinationPhoto: "",
    destinationPhone: "",
    sourcePhoto: "photo-data",
    sourcePhone: "0821234567",
  });

  assert.equal(result.shouldOfferReuse, false);
});
