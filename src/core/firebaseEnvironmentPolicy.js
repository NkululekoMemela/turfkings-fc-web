export const FIREBASE_ENVIRONMENT_KEY = "firebase-environment-switch:selected";
const STATE_KEY = "firebase-environment-switch:browser-state";
const SESSION_KEY = "firebase-environment-switch:session-state";
const SNAPSHOT_PREFIX = "firebase-environment-switch:snapshot:";
const SUPERADMIN_EMAIL = "nkululekolerato@gmail.com";

export function isFirebaseEnvironmentAdmin(user) {
  return Boolean(
    user?.uid &&
    user?.emailVerified === true &&
    String(user.email || "").trim().toLowerCase() === SUPERADMIN_EMAIL
  );
}

export function resolveFirebaseEnvironment(defaultEnvironment, enabled, choice) {
  const fallback = defaultEnvironment === "production" ? "production" : "staging";
  return enabled && ["staging", "production"].includes(choice) ? choice : fallback;
}

export function buildFirebaseFunctionsUrl({
  projectId, production, explicit = "", allowExplicit = true,
  allowEmulator = true, emulator = false, hostname = "",
}) {
  if (!projectId) throw new Error("Active Firebase project is missing.");
  if (allowExplicit && explicit.trim()) return explicit.trim().replace(/\/+$/, "");
  if (!production && allowEmulator && emulator &&
      ["localhost", "127.0.0.1"].includes(hostname)) {
    return `http://127.0.0.1:5001/${projectId}/us-central1`;
  }
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

function applicationKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && !key.startsWith("firebase-environment-switch:") &&
        !/^firebase[:_-]/i.test(key)) keys.push(key);
  }
  return keys;
}

function capture(storage) {
  return Object.fromEntries(applicationKeys(storage).map(key => [
    key, storage.getItem(key),
  ]));
}

function apply(storage, values) {
  for (const key of applicationKeys(storage)) storage.removeItem(key);
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string" ||
        key.startsWith("firebase-environment-switch:") ||
        /^firebase[:_-]/i.test(key)) {
      throw new Error("Invalid saved browser state.");
    }
    storage.setItem(key, value);
  }
}

export function moveFirebaseBrowserState(local, session, from, to) {
  if (!["staging", "production"].includes(from) ||
      !["staging", "production"].includes(to)) {
    throw new Error("Invalid Firebase environment.");
  }
  if (from === to) return;

  const source = capture(local);
  const sessionSource = capture(session);
  const rawTarget = local.getItem(`${SNAPSHOT_PREFIX}${to}`);
  const target = rawTarget ? JSON.parse(rawTarget) : {};
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new Error("Saved environment state is invalid.");
  }

  // Save before removing anything. Quota failures leave the current state intact.
  local.setItem(`${SNAPSHOT_PREFIX}${from}`, JSON.stringify(source));
  try {
    apply(local, target);
    apply(session, {});
    local.setItem(STATE_KEY, to);
    session.setItem(SESSION_KEY, to);
  } catch (error) {
    apply(local, source);
    apply(session, sessionSource);
    local.setItem(STATE_KEY, from);
    session.setItem(SESSION_KEY, from);
    throw error;
  }
}

export function initializeFirebaseBrowserState(local, session, environment) {
  const previous = local.getItem(STATE_KEY);
  if (previous && previous !== environment) {
    moveFirebaseBrowserState(local, session, previous, environment);
  } else {
    local.setItem(STATE_KEY, environment);
  }
  const sessionEnvironment = session.getItem(SESSION_KEY);
  if (sessionEnvironment && sessionEnvironment !== environment) {
    apply(session, {});
  }
  session.setItem(SESSION_KEY, environment);
}
