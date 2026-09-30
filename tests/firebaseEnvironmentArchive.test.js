import test from "node:test";
import assert from "node:assert/strict";
import { moveFirebaseBrowserState } from
  "../src/core/firebaseEnvironmentArchive.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key: i => [...values.keys()][i] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (key.startsWith("firebase-environment-switch:snapshot:")) {
        throw new Error("localStorage snapshot quota exceeded");
      }
      values.set(key, String(value));
    },
    removeItem: key => values.delete(key),
  };
}

function archive(initial = {}) {
  let saved = structuredClone(initial);
  return {
    readAll: async () => structuredClone(saved),
    writeAll: async values => { saved = structuredClone(values); },
  };
}

test("round trips avoid localStorage snapshots and preserve sign-in", async () => {
  const local = storage({
    tk_identity_v1: "production-player",
    "firebase:authUser:key": "signed-in",
  });
  const session = storage({ signup_cache: "old" });
  const saved = archive();
  await moveFirebaseBrowserState(local, session, "production", "staging", saved);
  assert.equal(local.getItem("tk_identity_v1"), null);
  assert.equal(session.getItem("signup_cache"), null);
  assert.equal(local.getItem("firebase:authUser:key"), "signed-in");
  local.setItem("tk_identity_v1", "staging-player");
  await moveFirebaseBrowserState(local, session, "staging", "production", saved);
  assert.equal(local.getItem("tk_identity_v1"), "production-player");
});

test("failed backup preserves active state and old backup", async () => {
  const key = "firebase-environment-switch:snapshot:staging";
  const local = storage({
    tk_identity_v1: "production-player",
    [key]: JSON.stringify({ tk_identity_v1: "staging-player" }),
  });
  const saved = archive();
  saved.writeAll = async () => { throw new Error("backup unavailable"); };
  await assert.rejects(
    moveFirebaseBrowserState(local, storage(), "production", "staging", saved),
    /backup unavailable/,
  );
  assert.equal(local.getItem("tk_identity_v1"), "production-player");
  assert.notEqual(local.getItem(key), null);
});

test("old backups migrate and support a round trip", async () => {
  const key = "firebase-environment-switch:snapshot:staging";
  const local = storage({
    tk_identity_v1: "production-player",
    [key]: JSON.stringify({ tk_identity_v1: "staging-player" }),
  });
  const saved = archive();
  await moveFirebaseBrowserState(local, storage(), "production", "staging", saved);
  assert.equal(local.getItem(key), null);
  assert.equal(local.getItem("tk_identity_v1"), "staging-player");
  await moveFirebaseBrowserState(local, storage(), "staging", "production", saved);
  assert.equal(local.getItem("tk_identity_v1"), "production-player");
});
