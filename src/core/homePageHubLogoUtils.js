// src/core/homePageHubLogoUtils.js

export function slugifyClubName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getClubInitials(name, fallback = "FC") {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return fallback;
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function buildLogoPrompt({ clubName, location, style = "modern" }) {
  const safeName = String(clubName || "football club").trim();
  const safeLocation = String(location || "South Africa").trim();

  return [
    `Create a unique football club logo for ${safeName}.`,
    `The club is based around ${safeLocation}.`,
    "The logo must include a football somewhere in the design.",
    "Use a clean modern sports badge style.",
    "Do not use copyrighted club references.",
    `Style direction: ${style}.`,
    "Also prepare a transparent-background version after the final logo is selected.",
  ].join(" ");
}

export function buildGeneratedLogoOptions({ clubName, location, accent }) {
  const initials = getClubInitials(clubName);
  const safeAccent = accent || "#16a34a";

  return [
    {
      id: "generated-option-a",
      title: "Badge option",
      initials,
      accent: safeAccent,
      tone: "Classic football badge",
      prompt: buildLogoPrompt({ clubName, location, style: "classic badge, premium, bold" }),
    },
    {
      id: "generated-option-b",
      title: "Modern option",
      initials,
      accent: safeAccent,
      tone: "Modern app icon style",
      prompt: buildLogoPrompt({ clubName, location, style: "modern app icon, clean, high contrast" }),
    },
  ];
}

export function buildLogoStorageNames(clubId) {
  const safeClubId = slugifyClubName(clubId) || "club";

  return {
    mainLogoPath: `clubs/${safeClubId}/branding/logo-main.png`,
    transparentLogoPath: `clubs/${safeClubId}/branding/logo-transparent.png`,
  };
}

export function normalizeBankDetails(details = {}) {
  return {
    bankName: String(details.bankName || "").trim(),
    accountHolder: String(details.accountHolder || "").trim(),
    accountNumber: String(details.accountNumber || "").trim(),
    branchCode: String(details.branchCode || "").trim(),
    paymentReference: String(details.paymentReference || "").trim(),
  };
}
