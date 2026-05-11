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
  const words = safeText(name).split(/\s+/).filter(Boolean);
  if (!words.length) return "FC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

function splitClubName(name = "Football Club") {
  const clean = safeText(name) || "Football Club";
  const words = clean.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] || "FOOTBALL", "CLUB"];
  return [words.slice(0, -1).join(" "), words.at(-1)];
}

function softAccent(accent = "#16a34a") {
  const color = /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#16a34a";
  return {
    accent: color,
    deep: "#06152b",
    ink: "#020617",
    green: "#065f46",
    gold: "#eab308",
    red: "#b91c1c",
    white: "#ffffff",
  };
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function textStrokeAttrs(stroke = "#020617", width = 7) {
  return `paint-order="stroke" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"`;
}

function buildRoyalCrest({ clubName, accent, seed }) {
  const [line1, line2] = splitClubName(clubName);
  const c = softAccent(accent);
  const stripe = seed % 2 === 0 ? c.red : c.green;

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="gold" x1="0" x2="1">
      <stop offset="0%" stop-color="#ffe08a"/>
      <stop offset="100%" stop-color="#b7791f"/>
    </linearGradient>
    <linearGradient id="dark" x1="30" y1="20" x2="270" y2="285">
      <stop offset="0%" stop-color="#0b1f46"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#020617" flood-opacity="0.35"/></filter>
  </defs>

  <rect width="300" height="300" rx="32" fill="#fff"/>
  <g filter="url(#shadow)">
    <path d="M150 18 L264 58 L245 220 L150 288 L55 220 L36 58 Z" fill="url(#gold)"/>
    <path d="M150 35 L243 68 L228 207 L150 262 L72 207 L57 68 Z" fill="url(#dark)"/>

    <path d="M82 139 H218 V205 L150 244 L82 205 Z" fill="${stripe}" opacity="0.92"/>
    <path d="M104 139 V223 M150 139 V244 M196 139 V223" stroke="#06152b" stroke-width="16" opacity="0.7"/>

    <text x="150" y="88" text-anchor="middle" font-family="Impact, Arial Black, Arial, sans-serif"
      font-size="${line1.length > 10 ? 25 : 33}" font-weight="900" fill="#fff"
      ${textStrokeAttrs("#020617", 5)} letter-spacing="1">${escapeXml(line1)}</text>

    <text x="150" y="121" text-anchor="middle" font-family="Impact, Arial Black, Arial, sans-serif"
      font-size="${line2.length > 10 ? 25 : 35}" font-weight="900" fill="#fff"
      ${textStrokeAttrs("#020617", 5)} letter-spacing="1">${escapeXml(line2)}</text>

    <text x="150" y="151" text-anchor="middle" font-family="Arial Black, Arial, sans-serif"
      font-size="18" fill="url(#gold)" ${textStrokeAttrs("#020617", 4)} letter-spacing="2">FOOTBALL CLUB</text>

    <circle cx="150" cy="204" r="34" fill="#fff" stroke="url(#gold)" stroke-width="7"/>
    <path d="M150 174 L159 196 H183 L164 211 L171 235 L150 221 L129 235 L136 211 L117 196 H141 Z" fill="#06152b"/>
    <path d="M102 239 C124 224 176 224 198 239" fill="none" stroke="url(#gold)" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>`.trim();
}

function buildActionMark({ clubName, accent, seed }) {
  const [line1, line2] = splitClubName(clubName);
  const c = softAccent(accent);
  const bootColor = seed % 2 === 0 ? c.accent : "#2563eb";

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs>
    <linearGradient id="bg" x1="0" x2="1">
      <stop offset="0%" stop-color="#071427"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#020617" flood-opacity="0.4"/></filter>
  </defs>

  <rect width="300" height="300" rx="32" fill="#fff"/>
  <g filter="url(#shadow)">
    <path d="M48 210 L108 92 L160 111 L133 188 L212 188 L248 223 L212 248 L68 248 Z"
      fill="${bootColor}" stroke="#06152b" stroke-width="6" stroke-linejoin="round"/>

    <circle cx="222" cy="112" r="42" fill="#fff" stroke="#06152b" stroke-width="7"/>
    <path d="M222 76 L232 102 H260 L238 117 L246 144 L222 127 L198 144 L206 117 L184 102 H212 Z" fill="#06152b"/>

    <circle cx="203" cy="212" r="30" fill="#fff" stroke="#06152b" stroke-width="6"/>
    <path d="M203 184 L211 201 H230 L215 214 L221 233 L203 222 L185 233 L191 214 L176 201 H195 Z" fill="#06152b"/>

    <rect x="34" y="208" width="232" height="58" rx="18" fill="url(#bg)" stroke="${c.accent}" stroke-width="3"/>

    <text x="150" y="232" text-anchor="middle" font-family="Impact, Arial Black, Arial, sans-serif"
      font-size="${line1.length > 10 ? 24 : 30}" fill="#fff" ${textStrokeAttrs("#020617", 5)}>
      ${escapeXml(line1)}
    </text>

    <text x="150" y="254" text-anchor="middle" font-family="Arial Black, Arial, sans-serif"
      font-size="16" fill="${c.accent}" ${textStrokeAttrs("#020617", 3)} letter-spacing="1">
      ${escapeXml(line2)} • 5 ASIDES
    </text>
  </g>
</svg>`.trim();
}

function buildEliteRoundel({ clubName, accent }) {
  const [line1, line2] = splitClubName(clubName);
  const c = softAccent(accent);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  <defs>
    <radialGradient id="ring" cx="50%" cy="40%">
      <stop offset="0%" stop-color="#0b2447"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#020617" flood-opacity="0.35"/></filter>
  </defs>

  <rect width="300" height="300" rx="32" fill="#fff"/>
  <g filter="url(#shadow)">
    <circle cx="150" cy="150" r="108" fill="url(#ring)" stroke="${c.accent}" stroke-width="8"/>
    <circle cx="150" cy="150" r="92" fill="none" stroke="#eab308" stroke-width="3"/>

    <path d="M82 205 V116 M112 220 V100 M188 220 V100 M218 205 V116"
      stroke="${c.green}" stroke-width="18" opacity="0.55"/>

    <text x="150" y="116" text-anchor="middle" font-family="Impact, Arial Black, Arial, sans-serif"
      font-size="${line1.length > 10 ? 25 : 34}" fill="#fff" ${textStrokeAttrs("#020617", 5)}>
      ${escapeXml(line1)}
    </text>

    <text x="150" y="152" text-anchor="middle" font-family="Impact, Arial Black, Arial, sans-serif"
      font-size="${line2.length > 10 ? 22 : 30}" fill="#fff" ${textStrokeAttrs("#020617", 5)}>
      ${escapeXml(line2)}
    </text>

    <text x="150" y="179" text-anchor="middle" font-family="Arial Black, Arial, sans-serif"
      font-size="16" fill="#eab308" ${textStrokeAttrs("#020617", 3)} letter-spacing="1">
      FOOTBALL CLUB
    </text>

    <circle cx="150" cy="216" r="28" fill="#fff" stroke="#eab308" stroke-width="5"/>
    <path d="M150 190 L158 207 H176 L162 218 L167 236 L150 225 L133 236 L138 218 L124 207 H142 Z" fill="#06152b"/>
  </g>
</svg>`.trim();
}

function buildBadgeSvg({ clubName, accent, variant, seed }) {
  if (variant === "action-mark") return buildActionMark({ clubName, accent, seed });
  if (variant === "elite-roundel") return buildEliteRoundel({ clubName, accent, seed });
  return buildRoyalCrest({ clubName, accent, seed });
}

export function buildSvgLogoOptions({
  clubName = "Football Club",
  accent = "#16a34a",
  seed = 0,
} = {}) {
  const variants = [
    {
      id: `royal-${seed}`,
      title: "Royal crest",
      tone: "Classic shield with strong football authority.",
      variant: "royal-crest",
    },
    {
      id: `action-${seed}`,
      title: "Action mark",
      tone: "Dynamic boot, ball and banner identity.",
      variant: "action-mark",
    },
    {
      id: `elite-${seed}`,
      title: "Elite roundel",
      tone: "Clean premium club badge for modern football.",
      variant: "elite-roundel",
    },
  ];

  return variants.map((item) => {
    const svg = buildBadgeSvg({
      clubName,
      accent,
      variant: item.variant,
      seed,
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
