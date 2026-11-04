// src/core/accessCodes.js

export const GLOBAL_CAPTAIN_CODES = ["11", "22"];

export function isCaptainCode(value) {
  return GLOBAL_CAPTAIN_CODES.includes(String(value || "").trim());
}

export function isAdminCode(value, adminCode = "3333") {
  return String(value || "").trim() === String(adminCode || "3333").trim();
}

export function isAdminOrCaptainCode(value, adminCode = "3333") {
  return isAdminCode(value, adminCode) || isCaptainCode(value);
}
