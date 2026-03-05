// src/storage/localStorageClient.js

const STORAGE_KEY = "turfkings-5aside-state-v1";

/**
 * Load raw state from localStorage.
 * LEGACY behaviour remains identical:
 *   loadRawState() -> uses STORAGE_KEY
 *
 * V2 support:
 *   loadRawState(customKey) -> uses customKey
 */
export function loadRawState(customKey) {
  if (typeof window === "undefined") return null;

  const key =
    typeof customKey === "string" && customKey.trim() ? customKey : STORAGE_KEY;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load state from localStorage", err);
    return null;
  }
}

/**
 * Save raw state to localStorage.
 * LEGACY behaviour remains identical:
 *   saveRawState(state) -> uses STORAGE_KEY
 *
 * V2 support:
 *   saveRawState(customKey, state) -> uses customKey
 */
export function saveRawState(arg1, arg2) {
  if (typeof window === "undefined") return;

  const isTwoArg = arguments.length >= 2;

  const key = isTwoArg
    ? String(arg1 || "").trim() || STORAGE_KEY
    : STORAGE_KEY;

  const state = isTwoArg ? arg2 : arg1;

  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state to localStorage", err);
  }
}