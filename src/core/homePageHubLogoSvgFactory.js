// src/core/homePageHubLogoSvgFactory.js

function safeText(value) {
  return String(value || "").trim();
}

function escapeXml(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getInitials(name = "FC") {
  const words = safeText(name)
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "FC";

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

function softAccent(accent = "#16a34a") {
  const fallback = "#16a34a";
  const color = /^#[0-9a-f]{6}$/i.test(accent) ? accent : fallback;

  return {
    accent: color,
    deep: "#06152b",
    darkGreen: "#052e16",
    cream: "#f8fafc",
    mist: "#dcfce7",
    gold: "#facc15",
  };
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildBadgeSvg({ clubName, accent, variant = "shield" }) {
  const initials = escapeXml(getInitials(clubName));
  const name = escapeXml(clubName || "Football Club");
  const c = softAccent(accent);

  const patterns = {
    shield: `
      <path d="M150 24 L256 64 V150 C256 220 210 268 150 292 C90 268 44 220 44 150 V64 Z" fill="url(#mainGrad)" stroke="white" stroke-width="10"/>
      <path d="M76 82 C108 68 196 68 224 82 V146 C224 198 190 234 150 252 C110 234 76 198 76 146 Z" fill="rgba(255,255,255,0.14)"/>
    `,
    roundel: `
      <circle cx="150" cy="150" r="122" fill="url(#mainGrad)" stroke="white" stroke-width="10"/>
      <circle cx="150" cy="150" r="88" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.38)" stroke-width="4"/>
    `,
    street: `
      <rect x="36" y="46" width="228" height="208" rx="54" fill="url(#mainGrad)" stroke="white" stroke-width="10"/>
      <path d="M68 204 C108 176 156 226 232 176" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="16" stroke-linecap="round"/>
      <path d="M68 104 C124 130 170 64 232 98" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="12" stroke-linecap="round"/>
    `,
  };

  const shape = patterns[variant] || patterns.shield;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" role="img" aria-label="${name} logo">
  <defs>
    <linearGradient id="mainGrad" x1="30" y1="20" x2="270" y2="285">
      <stop offset="0%" stop-color="${c.accent}"/>
      <stop offset="52%" stop-color="${c.darkGreen}"/>
      <stop offset="100%" stop-color="${c.deep}"/>
    </linearGradient>
    <radialGradient id="glow" cx="35%" cy="20%" r="75%">
      <stop offset="0%" stop-color="white" stop-opacity="0.46"/>
      <stop offset="62%" stop-color="white" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#020617" flood-opacity="0.28"/>
    </filter>
  </defs>

  <rect width="300" height="300" rx="48" fill="#f8fafc"/>
  <g filter="url(#shadow)">
    ${shape}
    <path d="M54 82 C98 40 198 38 246 86" fill="none" stroke="url(#glow)" stroke-width="42" stroke-linecap="round"/>
  </g>

  <circle cx="218" cy="218" r="34" fill="white" opacity="0.96"/>
  <circle cx="218" cy="218" r="22" fill="${c.deep}" opacity="0.95"/>
  <path d="M208 218 L218 208 L228 218 L218 228 Z" fill="${c.gold}" opacity="0.9"/>

  <text x="150" y="160" text-anchor="middle"
    font-family="Inter, Arial, sans-serif"
    font-size="${initials.length > 2 ? 58 : 74}"
    font-weight="1000"
    fill="white"
    letter-spacing="-3">${initials}</text>

  <text x="150" y="196" text-anchor="middle"
    font-family="Inter, Arial, sans-serif"
    font-size="18"
    font-weight="900"
    fill="rgba(255,255,255,0.86)"
    letter-spacing="1.4">5-A-SIDE</text>
</svg>`.trim();
}

export function buildSvgLogoOptions({ clubName, accent }) {
  const variants = [
    { id: "svg-shield", title: "Modern shield", tone: "Clean club badge", variant: "shield" },
    { id: "svg-roundel", title: "Classic roundel", tone: "Traditional football mark", variant: "roundel" },
    { id: "svg-street", title: "Street badge", tone: "Urban 5-a-side feel", variant: "street" },
  ];

  return variants.map((item) => {
    const svg = buildBadgeSvg({
      clubName,
      accent,
      variant: item.variant,
    });

    return {
      ...item,
      svg,
      previewUrl: svgToDataUrl(svg),
    };
  });
}

export function getSelectedSvgLogo(options, selectedId) {
  return options.find((item) => item.id === selectedId) || null;
}
