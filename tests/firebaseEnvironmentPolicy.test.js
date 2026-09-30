import test from "node:test";
import assert from "node:assert/strict";
import {
  FIREBASE_ENVIRONMENT_KEY, resolveFirebaseEnvironment,
  isFirebaseEnvironmentAdmin, buildFirebaseFunctionsUrl,
  moveFirebaseBrowserState, initializeFirebaseBrowserState,
} from "../src/core/firebaseEnvironmentPolicy.js";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(i) { return [...values.keys()][i] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test("disabled builds ignore overrides; invalid choices use the configured project", () => {
  assert.equal(resolveFirebaseEnvironment("production", false, "staging"), "production");
  assert.equal(resolveFirebaseEnvironment("staging", true, "production"), "production");
  assert.equal(resolveFirebaseEnvironment("staging", true, "unknown"), "staging");
});

test("only the verified superadmin passes the switch identity check", () => {
  const admin = { uid: "admin", email: "nkululekolerato@gmail.com", emailVerified: true };
  assert.equal(isFirebaseEnvironmentAdmin(admin), true);
  assert.equal(isFirebaseEnvironmentAdmin({ ...admin, emailVerified: false }), false);
  assert.equal(isFirebaseEnvironmentAdmin({ ...admin, email: "player@example.com" }), false);
  assert.equal(isFirebaseEnvironmentAdmin({ ...admin, uid: "" }), false);
  assert.equal(isFirebaseEnvironmentAdmin(null), false);
});

test("Functions follow the chosen project and Production never uses an emulator", () => {
  assert.equal(buildFirebaseFunctionsUrl({
    projectId: "five-asides-near-me", production: true,
    emulator: true, hostname: "localhost", allowExplicit: false,
    explicit: "https://wrong-project.example",
  }), "https://us-central1-five-asides-near-me.cloudfunctions.net");
  assert.equal(buildFirebaseFunctionsUrl({
    projectId: "five-asides-near-me-staging", production: false,
    emulator: true, hostname: "localhost",
  }), "http://127.0.0.1:5001/five-asides-near-me-staging/us-central1");
});

test("round trips isolate identities and caches while preserving Firebase auth keys", () => {
  const local = storage({
    fanm_turf_kings_identity_v1: "staging-player",
    fanm_homepage_hub_clubs_v1: "staging-clubs",
    "firebase:authUser:key:[DEFAULT]": "auth",
  });
  const session = storage({ signup_cache__one: "staging-signup" });
  initializeFirebaseBrowserState(local, session, "staging");
  moveFirebaseBrowserState(local, session, "staging", "production");
  assert.equal(local.getItem("fanm_turf_kings_identity_v1"), null);
  assert.equal(session.getItem("signup_cache__one"), null);
  assert.equal(local.getItem("firebase:authUser:key:[DEFAULT]"), "auth");
  local.setItem("fanm_turf_kings_identity_v1", "production-player");
  moveFirebaseBrowserState(local, session, "production", "staging");
  assert.equal(local.getItem("fanm_turf_kings_identity_v1"), "staging-player");
  assert.equal(local.getItem("fanm_homepage_hub_clubs_v1"), "staging-clubs");
  moveFirebaseBrowserState(local, session, "staging", "production");
  assert.equal(local.getItem("fanm_turf_kings_identity_v1"), "production-player");
});

test("a storage quota failure does not delete the active identity", () => {
  const local = storage({ tk_identity_v1: "original" });
  const session = storage();
  local.setItem = () => { throw new Error("quota"); };
  assert.throws(() => moveFirebaseBrowserState(
    local, session, "staging", "production",
  ), /quota/);
  assert.equal(local.getItem("tk_identity_v1"), "original");
});

test("another tab's old session cache is cleared after an environment change", () => {
  const local = storage();
  const session = storage({ signup_cache__one: "old" });
  initializeFirebaseBrowserState(local, session, "staging");
  local.setItem(FIREBASE_ENVIRONMENT_KEY, "production");
  const otherSession = storage({ signup_cache__two: "other-old" });
  initializeFirebaseBrowserState(local, otherSession, "production");
  initializeFirebaseBrowserState(local, session, "production");
  assert.equal(session.getItem("signup_cache__one"), null);
});
