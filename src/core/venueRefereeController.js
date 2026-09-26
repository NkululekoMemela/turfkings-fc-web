const DEVICE_KEY = "fanmVenueRefereeDeviceId";

export function getVenueRefereeDeviceId() {
  if (typeof window === "undefined") return "server-device";

  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;

    const created =
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `field-device-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return `field-device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function buildVenueRefereeController({
  deviceId,
  identity,
  user,
  role,
}) {
  return {
    uid: user?.uid || "",
    deviceId,
    name:
      identity?.shortName ||
      identity?.displayName ||
      identity?.fullName ||
      identity?.name ||
      user?.displayName ||
      "Field official",
    role: role || identity?.actingRole || identity?.role || "referee",
    email: identity?.email || user?.email || null,
    acquiredAtISO: new Date().toISOString(),
  };
}
