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


function premiumDefs(accent) {
  const c = softAccent(accent);

  return `
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff7c2"/>
      <stop offset="18%" stop-color="#f8d66d"/>
      <stop offset="48%" stop-color="#a96712"/>
      <stop offset="72%" stop-color="#f7d66e"/>
      <stop offset="100%" stop-color="#6f3d08"/>
    </linearGradient>

    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="22%" stop-color="#dce6ef"/>
      <stop offset="48%" stop-color="#738194"/>
      <stop offset="70%" stop-color="#eef5fa"/>
      <stop offset="100%" stop-color="#4a5566"/>
    </linearGradient>

    <linearGradient id="accentMetal" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="12%" stop-color="${c.accent}"/>
      <stop offset="55%" stop-color="${c.accent}"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>

    <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#183967"/>
      <stop offset="42%" stop-color="#07172e"/>
      <stop offset="100%" stop-color="#01040c"/>
    </linearGradient>

    <radialGradient id="leather" cx="34%" cy="27%" r="76%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="35%" stop-color="#e8edf2"/>
      <stop offset="72%" stop-color="#9ba6b2"/>
      <stop offset="100%" stop-color="#273142"/>
    </radialGradient>

    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="${c.accent}" stop-opacity="0.58"/>
      <stop offset="65%" stop-color="${c.accent}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${c.accent}" stop-opacity="0"/>
    </radialGradient>

    <filter id="premiumShadow" x="-35%" y="-35%" width="170%" height="185%">
      <feDropShadow
        dx="0"
        dy="10"
        stdDeviation="8"
        flood-color="#020617"
        flood-opacity="0.48"
      />
    </filter>

    <filter id="microShadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow
        dx="0"
        dy="3"
        stdDeviation="2.5"
        flood-color="#020617"
        flood-opacity="0.55"
      />
    </filter>

    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <pattern id="mesh" width="12" height="12" patternUnits="userSpaceOnUse">
      <path
        d="M0 12 L12 0 M-3 3 L3 -3 M9 15 L15 9"
        stroke="#ffffff"
        stroke-width="0.65"
        opacity="0.09"
      />
    </pattern>
  </defs>`;
}

function footballSvg(cx, cy, radius) {
  const scale = radius / 42;

  return `
  <g
    transform="translate(${cx} ${cy}) scale(${scale})"
    filter="url(#microShadow)"
  >
    <circle
      cx="0"
      cy="0"
      r="42"
      fill="url(#leather)"
      stroke="url(#silver)"
      stroke-width="4"
    />
    <path
      d="M0 -13 L12 -4 L8 11 H-8 L-12 -4 Z"
      fill="#111827"
    />
    <path
      d="M0 -13 L0 -30
         M12 -4 L29 -10
         M8 11 L20 28
         M-8 11 L-20 28
         M-12 -4 L-29 -10"
      fill="none"
      stroke="#1f2937"
      stroke-width="4"
      stroke-linecap="round"
    />
    <path
      d="M-29 -10 L-34 8 L-20 28
         M29 -10 L34 8 L20 28
         M-34 8 L-22 34
         M34 8 L22 34"
      fill="none"
      stroke="#687384"
      stroke-width="3"
    />
    <ellipse
      cx="-12"
      cy="-18"
      rx="14"
      ry="8"
      fill="#ffffff"
      opacity="0.48"
      transform="rotate(-28)"
    />
  </g>`;
}

function clubNameSvg(clubName, {
  top = 206,
  width = 220,
  fill = "#ffffff",
  accent = "#eab308",
  stroke = "#020617",
} = {}) {
  const [line1, line2] = splitClubName(clubName);
  const longest = Math.max(line1.length, line2.length);
  const size =
    longest > 16
      ? 19
      : longest > 12
        ? 22
        : longest > 8
          ? 26
          : 29;

  return `
    <text
      x="150"
      y="${top}"
      text-anchor="middle"
      font-family="Arial Black, Impact, Arial, sans-serif"
      font-size="${size}"
      font-weight="900"
      fill="${fill}"
      ${textStrokeAttrs(stroke, 5)}
      letter-spacing="0.5"
      textLength="${width}"
      lengthAdjust="spacingAndGlyphs"
    >${escapeXml(line1)}</text>

    <text
      x="150"
      y="${top + 29}"
      text-anchor="middle"
      font-family="Arial Black, Impact, Arial, sans-serif"
      font-size="${Math.max(size - 2, 17)}"
      font-weight="900"
      fill="${fill}"
      ${textStrokeAttrs(stroke, 5)}
      letter-spacing="0.8"
      textLength="${Math.min(
        width,
        Math.max(76, line2.length * 19)
      )}"
      lengthAdjust="spacingAndGlyphs"
    >${escapeXml(line2)}</text>

    <text
      x="150"
      y="${top + 49}"
      text-anchor="middle"
      font-family="Arial, sans-serif"
      font-size="10"
      font-weight="800"
      fill="${accent}"
      ${textStrokeAttrs(stroke, 2.5)}
      letter-spacing="3"
    >FOOTBALL CLUB</text>`;
}

function crownSvg({ x = 150, y = 34, scale = 1 }) {
  return `
  <g
    transform="translate(${x} ${y}) scale(${scale})"
    filter="url(#microShadow)"
  >
    <path
      d="M-49 22 L-42 -17 L-19 5 L0 -29
         L19 5 L42 -17 L49 22 Z"
      fill="url(#gold)"
      stroke="#633806"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <path
      d="M-47 22 Q0 34 47 22 L43 36
         Q0 46 -43 36 Z"
      fill="url(#gold)"
      stroke="#633806"
      stroke-width="3"
    />
    <circle cx="-42" cy="-17" r="5" fill="#fff2a8"/>
    <circle cx="0" cy="-29" r="6" fill="#fff2a8"/>
    <circle cx="42" cy="-17" r="5" fill="#fff2a8"/>
    <path
      d="M-33 28 Q0 36 33 28"
      fill="none"
      stroke="#fff7c2"
      stroke-width="3"
      opacity="0.72"
    />
  </g>`;
}

function wingSvg(direction = 1) {
  return `
  <g transform="scale(${direction} 1)">
    <path
      d="M38 88
         C73 55 102 42 136 46
         C113 59 99 73 88 93
         C110 73 132 67 151 70
         C126 86 111 101 101 119
         C119 105 137 101 153 105
         C127 124 105 140 76 154
         C58 142 45 120 38 88 Z"
      fill="url(#silver)"
      stroke="#475569"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <path
      d="M52 91 C79 72 99 61 124 56
         M58 108 C85 90 107 81 134 77
         M66 125 C91 110 112 101 138 98
         M76 141 C96 130 115 120 136 113"
      fill="none"
      stroke="#ffffff"
      stroke-width="4"
      stroke-linecap="round"
      opacity="0.62"
    />
    <path
      d="M46 88 C71 66 98 50 129 47"
      fill="none"
      stroke="#ffffff"
      stroke-width="2"
      opacity="0.8"
    />
  </g>`;
}

function buildPremiumShield({ clubName, accent }) {
  const c = softAccent(accent);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <ellipse cx="150" cy="153" rx="132" ry="134" fill="url(#glow)"/>

  <g filter="url(#premiumShadow)">
    <path
      d="M150 18 L266 54 L248 208
         Q224 258 150 288
         Q76 258 52 208 L34 54 Z"
      fill="url(#silver)"
      stroke="#313b49"
      stroke-width="4"
    />
    <path
      d="M150 30 L251 62 L235 201
         Q212 243 150 271
         Q88 243 65 201 L49 62 Z"
      fill="url(#navy)"
      stroke="${c.accent}"
      stroke-width="7"
    />
    <path
      d="M150 43 L235 70 L221 193
         Q202 228 150 253
         Q98 228 79 193 L65 70 Z"
      fill="${c.accent}"
      opacity="0.78"
    />
    <path
      d="M150 43 V253
         M88 67 L88 213
         M212 67 L212 213"
      stroke="#020617"
      stroke-width="18"
      opacity="0.48"
    />
    <path
      d="M150 43 L235 70"
      stroke="#ffffff"
      stroke-width="3"
      opacity="0.45"
    />

    ${footballSvg(150, 122, 38)}

    <path
      d="M48 174 Q150 150 252 174
         L242 211 Q150 190 58 211 Z"
      fill="url(#navy)"
      stroke="url(#silver)"
      stroke-width="4"
    />

    ${clubNameSvg(clubName, {
      top: 187,
      width: 184,
      accent: c.accent,
    })}
  </g>
</svg>`.trim();
}

function buildRoyalWings({ clubName, accent }) {
  const c = softAccent(accent);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <ellipse cx="150" cy="150" rx="143" ry="132" fill="url(#glow)"/>

  <g filter="url(#premiumShadow)">
    <g transform="translate(150 0)">
      ${wingSvg(-1)}
      ${wingSvg(1)}
    </g>

    ${crownSvg({ x: 150, y: 47, scale: 0.86 })}

    <path
      d="M150 66 L220 88 L209 192
         Q194 228 150 249
         Q106 228 91 192 L80 88 Z"
      fill="url(#gold)"
      stroke="#6b3e0b"
      stroke-width="4"
    />
    <path
      d="M150 78 L208 96 L198 187
         Q187 215 150 234
         Q113 215 102 187 L92 96 Z"
      fill="url(#navy)"
      stroke="${c.accent}"
      stroke-width="6"
    />
    <path
      d="M150 82 V233"
      stroke="${c.accent}"
      stroke-width="25"
      opacity="0.7"
    />
    <path
      d="M107 101 H193"
      stroke="#ffffff"
      stroke-width="3"
      opacity="0.45"
    />

    ${footballSvg(150, 139, 33)}

    <path
      d="M50 197 Q150 172 250 197
         L237 239 Q150 216 63 239 Z"
      fill="url(#navy)"
      stroke="url(#gold)"
      stroke-width="5"
    />

    ${clubNameSvg(clubName, {
      top: 209,
      width: 176,
      accent: c.accent,
    })}
  </g>
</svg>`.trim();
}

function buildEagleCrest({ clubName, accent }) {
  const c = softAccent(accent);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <ellipse cx="150" cy="144" rx="141" ry="128" fill="url(#glow)"/>

  <g filter="url(#premiumShadow)">
    <path
      d="M147 95
         C117 55 77 34 30 39
         C60 58 77 79 87 105
         C63 86 41 82 19 89
         C49 107 67 125 81 151
         C58 139 39 139 23 146
         C58 170 91 180 129 176 Z"
      fill="url(#silver)"
      stroke="#334155"
      stroke-width="4"
    />
    <path
      d="M153 95
         C183 55 223 34 270 39
         C240 58 223 79 213 105
         C237 86 259 82 281 89
         C251 107 233 125 219 151
         C242 139 261 139 277 146
         C242 170 209 180 171 176 Z"
      fill="url(#silver)"
      stroke="#334155"
      stroke-width="4"
    />

    <path
      d="M45 52 Q87 65 127 119
         M32 96 Q77 103 124 140
         M39 150 Q80 157 119 164
         M255 52 Q213 65 173 119
         M268 96 Q223 103 176 140
         M261 150 Q220 157 181 164"
      fill="none"
      stroke="#ffffff"
      stroke-width="4"
      opacity="0.55"
      stroke-linecap="round"
    />

    <path
      d="M150 64
         C132 70 121 88 124 108
         C128 130 145 140 151 156
         C162 144 172 128 174 109
         C175 93 166 76 150 64 Z"
      fill="#f4f7fa"
      stroke="#394556"
      stroke-width="4"
    />
    <path
      d="M158 92 L190 101 L160 116 Z"
      fill="url(#gold)"
      stroke="#6b3e0b"
      stroke-width="3"
    />
    <circle cx="153" cy="88" r="4.5" fill="#020617"/>
    <circle cx="152" cy="87" r="1.5" fill="#ffffff"/>

    ${footballSvg(150, 163, 37)}

    <path
      d="M44 196 Q150 166 256 196
         L241 241 Q150 217 59 241 Z"
      fill="url(#navy)"
      stroke="${c.accent}"
      stroke-width="6"
    />

    ${clubNameSvg(clubName, {
      top: 209,
      width: 180,
      accent: c.accent,
    })}

    <path
      d="M120 196 L102 180 M180 196 L198 180"
      stroke="url(#gold)"
      stroke-width="8"
      stroke-linecap="round"
    />
  </g>
</svg>`.trim();
}

function buildFlameStrike({ clubName, accent }) {
  const c = softAccent(accent);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <ellipse cx="150" cy="145" rx="125" ry="137" fill="url(#glow)"/>

  <g filter="url(#premiumShadow)">
    <path
      d="M150 18
         C191 59 208 90 194 123
         C226 103 236 77 229 54
         C264 91 267 137 237 169
         C216 193 190 204 150 207
         C110 204 84 193 63 169
         C33 137 36 91 71 54
         C64 77 74 103 106 123
         C92 90 109 59 150 18 Z"
      fill="#f97316"
      stroke="#7c2d12"
      stroke-width="5"
    />
    <path
      d="M150 45
         C175 75 180 100 166 123
         C188 117 201 101 204 83
         C218 115 205 151 179 164
         C164 172 136 172 121 164
         C95 151 82 115 96 83
         C99 101 112 117 134 123
         C120 100 125 75 150 45 Z"
      fill="#facc15"
      stroke="#ea580c"
      stroke-width="4"
    />
    <path
      d="M150 78
         C166 102 164 119 150 137
         C136 119 134 102 150 78 Z"
      fill="#ffffff"
      opacity="0.86"
      filter="url(#softGlow)"
    />

    ${footballSvg(150, 152, 48)}

    <path
      d="M34 194 Q150 163 266 194
         L248 243 Q150 219 52 243 Z"
      fill="url(#navy)"
      stroke="url(#gold)"
      stroke-width="5"
    />

    ${clubNameSvg(clubName, {
      top: 208,
      width: 196,
      accent: c.accent,
    })}

    <path
      d="M56 246 Q150 268 244 246"
      fill="none"
      stroke="${c.accent}"
      stroke-width="6"
      stroke-linecap="round"
    />
  </g>
</svg>`.trim();
}

function buildClassicRoundel({ clubName, accent }) {
  const c = softAccent(accent);
  const [line1, line2] = splitClubName(clubName);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <circle cx="150" cy="150" r="137" fill="url(#glow)"/>

  <g filter="url(#premiumShadow)">
    <circle
      cx="150"
      cy="150"
      r="118"
      fill="url(#silver)"
      stroke="#354052"
      stroke-width="4"
    />
    <circle
      cx="150"
      cy="150"
      r="107"
      fill="url(#navy)"
      stroke="${c.accent}"
      stroke-width="7"
    />
    <circle
      cx="150"
      cy="150"
      r="76"
      fill="${c.accent}"
      stroke="url(#gold)"
      stroke-width="5"
    />
    <circle
      cx="150"
      cy="150"
      r="65"
      fill="url(#navy)"
    />
    <circle
      cx="150"
      cy="150"
      r="103"
      fill="none"
      stroke="#ffffff"
      stroke-width="2"
      opacity="0.32"
    />

    <path
      d="M77 190
         C55 169 51 135 65 105
         M68 174 L50 166
         M64 153 L44 148
         M64 132 L46 127
         M70 111 L53 101
         M223 190
         C245 169 249 135 235 105
         M232 174 L250 166
         M236 153 L256 148
         M236 132 L254 127
         M230 111 L247 101"
      fill="none"
      stroke="url(#gold)"
      stroke-width="6"
      stroke-linecap="round"
    />

    ${footballSvg(150, 151, 43)}

    <text
      x="150"
      y="75"
      text-anchor="middle"
      font-family="Arial Black, Arial, sans-serif"
      font-size="${line1.length > 13 ? 17 : 21}"
      font-weight="900"
      fill="#ffffff"
      ${textStrokeAttrs("#020617", 4)}
      textLength="154"
      lengthAdjust="spacingAndGlyphs"
    >${escapeXml(line1)}</text>

    <text
      x="150"
      y="237"
      text-anchor="middle"
      font-family="Arial Black, Arial, sans-serif"
      font-size="${line2.length > 13 ? 17 : 21}"
      font-weight="900"
      fill="#ffffff"
      ${textStrokeAttrs("#020617", 4)}
      textLength="${Math.max(80, Math.min(154, line2.length * 18))}"
      lengthAdjust="spacingAndGlyphs"
    >${escapeXml(line2)}</text>

    <circle cx="56" cy="150" r="5" fill="url(#gold)"/>
    <circle cx="244" cy="150" r="5" fill="url(#gold)"/>
  </g>
</svg>`.trim();
}

function buildModernBadge({ clubName, accent }) {
  const c = softAccent(accent);
  const initials = getInitials(clubName);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <ellipse cx="150" cy="148" rx="131" ry="138" fill="url(#glow)"/>

  <g filter="url(#premiumShadow)">
    <path
      d="M150 18 L257 80 L257 204
         L150 282 L43 204 L43 80 Z"
      fill="url(#silver)"
      stroke="#354052"
      stroke-width="4"
    />
    <path
      d="M150 33 L243 87 L243 196
         L150 264 L57 196 L57 87 Z"
      fill="url(#navy)"
      stroke="${c.accent}"
      stroke-width="7"
    />
    <path
      d="M150 48 L229 94 L229 187
         L150 246 L71 187 L71 94 Z"
      fill="url(#mesh)"
      stroke="#ffffff"
      stroke-width="2"
      opacity="0.92"
    />

    <path
      d="M70 184 L230 91 L230 139 L89 221 Z"
      fill="${c.accent}"
      opacity="0.82"
    />
    <path
      d="M82 202 L225 119"
      stroke="#ffffff"
      stroke-width="4"
      opacity="0.48"
    />

    <text
      x="150"
      y="154"
      text-anchor="middle"
      font-family="Arial Black, Impact, Arial, sans-serif"
      font-size="76"
      font-weight="900"
      font-style="italic"
      fill="#ffffff"
      ${textStrokeAttrs("#020617", 9)}
      letter-spacing="-5"
    >${escapeXml(initials)}</text>

    ${footballSvg(204, 72, 25)}

    <path
      d="M43 201 Q150 176 257 201
         L242 244 Q150 222 58 244 Z"
      fill="url(#navy)"
      stroke="url(#silver)"
      stroke-width="4"
    />

    ${clubNameSvg(clubName, {
      top: 211,
      width: 181,
      accent: c.accent,
    })}
  </g>
</svg>`.trim();
}

function buildCrownLegacy({ clubName, accent }) {
  const c = softAccent(accent);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <ellipse cx="150" cy="148" rx="128" ry="138" fill="url(#glow)"/>

  <g filter="url(#premiumShadow)">
    ${crownSvg({ x: 150, y: 58, scale: 1.24 })}

    <path
      d="M150 74 L224 100 L211 205
         Q193 245 150 267
         Q107 245 89 205 L76 100 Z"
      fill="url(#gold)"
      stroke="#6b3e0b"
      stroke-width="5"
    />
    <path
      d="M150 88 L209 108 L198 198
         Q186 228 150 247
         Q114 228 102 198 L91 108 Z"
      fill="${c.accent}"
      stroke="#020617"
      stroke-width="6"
    />
    <path
      d="M150 89 V246"
      stroke="#020617"
      stroke-width="30"
      opacity="0.64"
    />
    <path
      d="M102 114 H198"
      stroke="#ffffff"
      stroke-width="3"
      opacity="0.4"
    />

    ${footballSvg(150, 148, 36)}

    <path
      d="M52 190 Q150 167 248 190
         L236 232 Q150 211 64 232 Z"
      fill="url(#navy)"
      stroke="url(#gold)"
      stroke-width="5"
    />

    ${clubNameSvg(clubName, {
      top: 201,
      width: 171,
      accent: c.accent,
    })}

    <path
      d="M103 250 Q150 274 197 250"
      fill="none"
      stroke="url(#gold)"
      stroke-width="6"
      stroke-linecap="round"
    />
  </g>
</svg>`.trim();
}

function buildOriginalRoyalCrest({ clubName, accent, seed }) {
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

function buildOriginalActionMark({ clubName, accent, seed }) {
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

function buildOriginalEliteRoundel({ clubName, accent }) {
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


function buildLionAuthority({ clubName, accent }) {
  const c = softAccent(accent);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
  ${premiumDefs(accent)}

  <ellipse
    cx="150"
    cy="146"
    rx="136"
    ry="137"
    fill="url(#glow)"
  />

  <g filter="url(#premiumShadow)">
    <path
      d="M150 22 L251 62 L236 205
         Q213 254 150 283
         Q87 254 64 205 L49 62 Z"
      fill="url(#gold)"
      stroke="#653806"
      stroke-width="5"
    />

    <path
      d="M150 37 L236 71 L222 198
         Q202 237 150 263
         Q98 237 78 198 L64 71 Z"
      fill="url(#navy)"
      stroke="${c.accent}"
      stroke-width="7"
    />

    <path
      d="M150 50
         C119 50 93 68 84 96
         C72 132 91 166 112 181
         C123 190 134 197 150 208
         C166 197 177 190 188 181
         C209 166 228 132 216 96
         C207 68 181 50 150 50 Z"
      fill="url(#gold)"
      stroke="#6b3e0b"
      stroke-width="4"
    />

    <path
      d="M150 62
         C126 62 105 78 99 101
         C94 119 99 141 112 155
         L123 138
         C116 125 116 106 125 94
         C132 84 141 79 150 79
         C159 79 168 84 175 94
         C184 106 184 125 177 138
         L188 155
         C201 141 206 119 201 101
         C195 78 174 62 150 62 Z"
      fill="${c.accent}"
      stroke="#341f08"
      stroke-width="4"
    />

    <path
      d="M124 93
         C112 105 110 129 120 145
         C128 157 138 162 150 174
         C162 162 172 157 180 145
         C190 129 188 105 176 93
         C169 86 160 82 150 82
         C140 82 131 86 124 93 Z"
      fill="#d6a24d"
      stroke="#52300c"
      stroke-width="3"
    />

    <path
      d="M128 105
         Q137 96 146 104
         M154 104
         Q163 96 172 105"
      fill="none"
      stroke="#241506"
      stroke-width="5"
      stroke-linecap="round"
    />

    <circle cx="137" cy="107" r="3.5" fill="#020617"/>
    <circle cx="163" cy="107" r="3.5" fill="#020617"/>

    <path
      d="M150 111
         L141 124
         Q150 132 159 124 Z"
      fill="#302015"
      stroke="#160d07"
      stroke-width="2"
    />

    <path
      d="M150 129
         Q139 141 128 134
         M150 129
         Q161 141 172 134"
      fill="none"
      stroke="#40230d"
      stroke-width="3"
      stroke-linecap="round"
    />

    <path
      d="M116 143
         Q94 151 82 164
         M119 150
         Q95 164 87 180
         M184 143
         Q206 151 218 164
         M181 150
         Q205 164 213 180"
      fill="none"
      stroke="#fff0bd"
      stroke-width="3"
      stroke-linecap="round"
      opacity="0.72"
    />

    ${footballSvg(150, 179, 37)}

    <path
      d="M45 202 Q150 176 255 202
         L241 244 Q150 222 59 244 Z"
      fill="url(#navy)"
      stroke="url(#gold)"
      stroke-width="5"
    />

    ${clubNameSvg(clubName, {
      top: 213,
      width: 180,
      accent: c.accent,
    })}

    <path
      d="M102 253 Q150 275 198 253"
      fill="none"
      stroke="${c.accent}"
      stroke-width="6"
      stroke-linecap="round"
    />
  </g>
</svg>`.trim();
}

function buildBadgeSvg({
  clubName,
  accent,
  variant,
  seed,
}) {
  const builders = {
    "original-royal-crest":
      buildOriginalRoyalCrest,
    "original-action-mark":
      buildOriginalActionMark,
    "original-elite-roundel":
      buildOriginalEliteRoundel,
    "premium-shield":
      buildPremiumShield,
    "royal-wings":
      buildRoyalWings,
    "eagle-crest":
      buildEagleCrest,
    "flame-strike":
      buildFlameStrike,
    "classic-roundel":
      buildClassicRoundel,
    "modern-badge":
      buildModernBadge,
    "crown-legacy":
      buildCrownLegacy,
    "lion-authority":
      buildLionAuthority,
  };

  const builder =
    builders[variant] ||
    buildPremiumShield;

  return builder({
    clubName,
    accent,
    seed,
  });
}

export function buildSvgLogoOptions({
  clubName = "Football Club",
  accent = "#16a34a",
  seed = 0,
} = {}) {
  /*
   * Keep royal/action/elite IDs for previously saved choices.
   * Their artwork is upgraded, but existing selections remain valid.
   */
  const variants = [
    {
      id: `royal-${seed}`,
      title: "Royal Crest",
      tone:
        "The original classic shield with strong football authority.",
      variant: "original-royal-crest",
    },
    {
      id: `action-${seed}`,
      title: "Action Mark",
      tone:
        "The original dynamic boot, football and banner identity.",
      variant: "original-action-mark",
    },
    {
      id: `elite-${seed}`,
      title: "Elite Roundel",
      tone:
        "The original clean round badge for modern football.",
      variant: "original-elite-roundel",
    },
    {
      id: `royal-wings-${seed}`,
      title: "Royal Wings",
      tone:
        "Silver feathered wings, crown and a ceremonial shield.",
      variant: "royal-wings",
    },
    {
      id: `flame-${seed}`,
      title: "Flame Strike",
      tone:
        "A powerful match ball rising through dimensional flames.",
      variant: "flame-strike",
    },
    {
      id: `classic-${seed}`,
      title: "Classic Roundel",
      tone:
        "A timeless metallic roundel with laurel detailing.",
      variant: "classic-roundel",
    },
    {
      id: `shield-${seed}`,
      title: "Elite Shield",
      tone:
        "A deeply layered professional shield with metallic trim.",
      variant: "premium-shield",
    },
    {
      id: `eagle-${seed}`,
      title: "Eagle Authority",
      tone:
        "A commanding silver eagle guarding the club football.",
      variant: "eagle-crest",
    },
    {
      id: `modern-${seed}`,
      title: "Modern Identity",
      tone:
        "A sharp geometric badge built around the club initials.",
      variant: "modern-badge",
    },
    {
      id: `crown-${seed}`,
      title: "Crowned Legacy",
      tone:
        "A royal crown and heritage shield for an established club.",
      variant: "crown-legacy",
    },
    {
      id: `lion-${seed}`,
      title: "Lion Authority",
      tone:
        "A powerful lion, match ball and metallic heritage shield.",
      variant: "lion-authority",
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
