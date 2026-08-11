import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlatformPlayer,
  isPlatformPlayerComplete,
  mergePlatformPlayer,
} from "../src/core/platformPlayer/platformPlayerRepository.js";

test("Platform player normalises email", () => {
  const p = buildPlatformPlayer({
    email: " SOMEONE@MAIL.COM "
  });

  assert.equal(
    p.email,
    "someone@mail.com"
  );
});

test("Platform player completeness", () => {
  assert.equal(
    isPlatformPlayerComplete({
      uid:"1",
      email:"a@b.com",
      fullName:"John"
    }),
    true
  );
});

test("Merge preserves richer values", () => {
  const merged = mergePlatformPlayer(
    {
      photoUrl:"photo.jpg"
    },
    {
      uid:"123",
      email:"a@b.com",
      fullName:"John"
    }
  );

  assert.equal(
    merged.photoUrl,
    "photo.jpg"
  );

  assert.equal(
    merged.uid,
    "123"
  );
});
