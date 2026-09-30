import {
  moveFirebaseBrowserState as moveState,
  initializeFirebaseBrowserState as initializeState,
} from "./firebaseEnvironmentPolicy.js";
export {
  FIREBASE_ENVIRONMENT_KEY, resolveFirebaseEnvironment,
  isFirebaseEnvironmentAdmin, buildFirebaseFunctionsUrl,
} from "./firebaseEnvironmentPolicy.js";

const PREFIX = "firebase-environment-switch:snapshot:";
const STATE = "firebase-environment-switch:browser-state";

function applicationState(storage) {
  const result = {};
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key && !key.startsWith("firebase-environment-switch:") &&
        !/^firebase[:_-]/i.test(key)) {
      result[key] = storage.getItem(key);
    }
  }
  return result;
}

function validate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Saved environment state is invalid.");
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string" ||
        key.startsWith("firebase-environment-switch:") ||
        /^firebase[:_-]/i.test(key)) {
      throw new Error("Invalid saved browser state.");
    }
  }
  return value;
}

async function openArchive() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("five-asides-environment-state", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("snapshots");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(
      "Could not open backup storage. Your current state was retained."
    ));
    request.onblocked = () => reject(new Error(
      "Close other app tabs and retry the environment switch."
    ));
  });
}

const browserArchive = {
  async readAll() {
    const db = await openArchive();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readonly");
        const values = {};
        const request = tx.objectStore("snapshots").openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            values[cursor.key] = cursor.value;
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve(values);
        tx.onabort = () => reject(tx.error || new Error("Backup read failed."));
      });
    } finally {
      db.close();
    }
  },
  async writeAll(values) {
    const db = await openArchive();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        const store = tx.objectStore("snapshots");
        for (const [key, value] of Object.entries(values)) {
          store.put(value, key);
        }
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error || new Error(
          "Backup failed. Your current state was retained."
        ));
      });
    } finally {
      db.close();
    }
  },
};

async function prepare(local, from, archive) {
  const saved = await archive.readAll();
  const legacyKeys = [];
  for (const environment of ["staging", "production"]) {
    if (saved[environment]) validate(saved[environment]);
    const key = PREFIX + environment;
    const raw = local.getItem(key);
    if (raw !== null) {
      saved[environment] = validate(JSON.parse(raw));
      legacyKeys.push(key);
    }
  }
  saved[from] = applicationState(local);
  // Commit backups before removing their old localStorage copies.
  await archive.writeAll(saved);
  for (const key of legacyKeys) local.removeItem(key);

  return {
    get length() { return local.length; },
    key: index => local.key(index),
    getItem(key) {
      if (key.startsWith(PREFIX)) {
        const value = saved[key.slice(PREFIX.length)];
        return value ? JSON.stringify(value) : null;
      }
      return local.getItem(key);
    },
    setItem(key, value) {
      if (!key.startsWith(PREFIX)) local.setItem(key, value);
    },
    removeItem: key => local.removeItem(key),
  };
}

export async function moveFirebaseBrowserState(
  local, session, from, to, archive = browserArchive,
) {
  if (!["staging", "production"].includes(from) ||
      !["staging", "production"].includes(to)) {
    throw new Error("Invalid Firebase environment.");
  }
  if (from === to) return;
  const adapter = await prepare(local, from, archive);
  moveState(adapter, session, from, to);
}

export async function initializeFirebaseBrowserState(
  local, session, environment, archive = browserArchive,
) {
  const previous = local.getItem(STATE);
  if (previous && previous !== environment) {
    await moveFirebaseBrowserState(
      local, session, previous, environment, archive,
    );
  }
  initializeState(local, session, environment);
}
