// src/storage/localStorageClient.js

const STORAGE_KEY = "turfkings-5aside-state-v1";

export function loadRawState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to load state from localStorage", err);
    return null;
  }
}

export function saveRawState(state) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to save state to localStorage", err);
  }
}
