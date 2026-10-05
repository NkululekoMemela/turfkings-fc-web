const dateLabel = value => {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
      }).format(date)
    : "Date to be announced";
};

const clubName = (id, teams, season, fallback = "") =>
  teams.find(team => team.id === id)?.label ||
  teams.find(team => team.id === id)?.name ||
  season.invitations?.[id]?.clubName || fallback || id;

export function buildFieldFixturePosterRows({
  season, teams = [], clubId = "", fixtureId = "",
}) {
  const fixtures = season.fixtures || [];
  const days = season.matchDays || [];
  const rows = [];
  const appendFixture = (fixture, day = {}) => {
    if (fixtureId && fixture.id !== fixtureId) return;
    if (clubId && ![fixture.clubAId, fixture.clubBId].includes(clubId)) return;
    rows.push({
      clubAId: fixture.clubAId, clubBId: fixture.clubBId,
      nameA: clubName(fixture.clubAId, teams, season, fixture.clubAName),
      nameB: clubName(fixture.clubBId, teams, season, fixture.clubBName),
      date: dateLabel(day.dateLocal || fixture.scheduledLocal?.slice(0, 10)),
      time: fixture.scheduledLocal?.slice(11, 16) || "",
      round: day.roundNo || "",
      status: season.liveMatches?.[fixture.id]?.status === "live"
        ? "Live" : fixture.status === "completed" ? "Completed"
        : fixture.status === "cancelled" ? "Cancelled" : "Fixture",
    });
  };
  for (const day of days) {
    fixtures.filter(fixture => fixture.matchDayId === day.id)
      .sort((a, b) => String(a.scheduledLocal).localeCompare(String(b.scheduledLocal)))
      .forEach(fixture => appendFixture(fixture, day));
    for (const id of day.byeClubIds || []) {
      if (fixtureId) continue;
      if (clubId && id !== clubId) continue;
      rows.push({
        clubAId: id, clubBId: "", nameA: clubName(id, teams, season),
        nameB: "BYE", date: dateLabel(day.dateLocal),
        time: "", round: day.roundNo || "", status: "No game",
      });
    }
  }
  const datedIds = new Set(days.map(day => day.id));
  fixtures.filter(fixture => !datedIds.has(fixture.matchDayId))
    .forEach(fixture => appendFixture(fixture));
  return rows;
}

function loadBadge(source) {
  return new Promise(resolve => {
    if (!source) return resolve(null);
    const image = new Image();
    image.crossOrigin = "anonymous";
    let finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), 6000);
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = source;
  });
}

export async function downloadFieldFixturePoster({
  season, teams = [], clubId = "", venueName = "", fixtureId = "",
}) {
  const rows = buildFieldFixturePosterRows({season, teams, clubId, fixtureId});
  if (!rows.length) throw new Error("There are no fixtures to download.");
  if (document.fonts?.ready) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 1500);
      document.fonts.ready.then(() => {
        clearTimeout(timeout);
        resolve();
      }, () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  const badges = new Map();
  const ids = [...new Set(rows.flatMap(row =>
    [row.clubAId, row.clubBId]).filter(Boolean))];
  await Promise.all(ids.map(async id => {
    const team = teams.find(item => item.id === id);
    badges.set(id, await loadBadge(team?.transparentLogoUrl || team?.logoUrl));
  }));

  const single = Boolean(fixtureId);
  const width = single ? 1080 : 1200;
  const padding = single ? 54 : 52;
  const header = single ? 210 : 230;
  const rowHeight = single ? 660 : 260;
  const gap = 18;
  const footer = single ? 210 : 110;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = single
    ? 1080
    : header + rows.length * (rowHeight + gap) + footer;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the fixture image.");

  const background = ctx.createLinearGradient(0, 0, width, canvas.height);
  background.addColorStop(0, "#122c53");
  background.addColorStop(1, "#060e20");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, canvas.height);

  const write = (value, x, y, font, color = "#f8fafc", align = "center") => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(String(value || ""), x, y);
  };

  const lines = (value, x, y, maxWidth, size, maxLines = 3) => {
    const words = String(value || "").split(/\s+/);
    let fontSize = size;
    let output;
    do {
      ctx.font = `800 ${fontSize}px sans-serif`;
      output = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          output.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      if (line) output.push(line);
      if (output.length <= maxLines || fontSize <= 22) break;
      fontSize -= 2;
    } while (true);
    output.forEach((line, index) =>
      write(line, x, y + index * (fontSize + 7),
        `800 ${fontSize}px sans-serif`));
  };

  const badge = (id, name, centerX, top, size) => {
    const image = badges.get(id);
    const x = centerX - size / 2;
    ctx.fillStyle = "rgba(255,255,255,.07)";
    ctx.beginPath();
    ctx.roundRect(x - 12, top - 12, size + 24, size + 24, 24);
    ctx.fill();
    if (image) {
      const scale = Math.min(size / image.width, size / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      ctx.drawImage(image, centerX - w / 2, top + (size - h) / 2, w, h);
    } else {
      const initials = String(name || "?").split(/\s+/)
        .map(word => word[0]).join("").slice(0, 3).toUpperCase();
      write(initials, centerX, top + size * .62,
        `900 ${Math.round(size * .3)}px sans-serif`, "#bae6fd");
    }
  };

  write("5 ASIDES NEAR ME", width / 2, 52,
    "900 23px sans-serif", "#7dd3fc");
  const title = single ? "MATCH FIXTURE"
    : clubId ? `${clubName(clubId, teams, season)} fixtures`
    : "LEAGUE FIXTURES";
  lines(title, width / 2, 112, width - 100, single ? 46 : 44, 2);
  write(season.name || "Field League", width / 2, 176,
    "600 27px sans-serif", "#cbd5e1");

  rows.forEach((row, index) => {
    const y = header + index * (rowHeight + gap);
    ctx.fillStyle = "#112442";
    ctx.strokeStyle = "rgba(125,211,252,.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(padding, y, width - padding * 2, rowHeight, single ? 36 : 24);
    ctx.fill();
    ctx.stroke();

    if (single) {
      write(row.time ? `${row.time} · SAST` : "Time TBC",
        padding + 32, y + 62, "800 32px sans-serif", "#bae6fd", "left");
      write(row.date, width - padding - 32, y + 62,
        "800 30px sans-serif", "#bae6fd", "right");
      const left = 285;
      const right = width - left;
      badge(row.clubAId, row.nameA, left, y + 154, 200);
      badge(row.clubBId, row.nameB, right, y + 154, 200);
      write("VS", width / 2, y + 278, "900 44px sans-serif", "#7dd3fc");
      lines(row.nameA, left, y + 440, 380, 40);
      lines(row.nameB, right, y + 440, 380, 40);
      if (row.status && row.status !== "Fixture") {
        write(row.status, width / 2, y + 610,
          "800 26px sans-serif", "#7dd3fc");
      }
    } else {
      const details = [
        row.round ? `Match day ${row.round}` : "",
        row.date,
        row.time ? `${row.time} · SAST` : "",
      ].filter(Boolean).join("  ·  ");
      write(details, width / 2, y + 40,
        "800 25px sans-serif", "#bae6fd");
      const left = 310;
      const right = width - left;
      badge(row.clubAId, row.nameA, left, y + 67, 100);
      if (row.clubBId) badge(row.clubBId, row.nameB, right, y + 67, 100);
      write(row.clubBId ? "VS" : "BYE", width / 2, y + 130,
        "900 30px sans-serif", "#7dd3fc");
      lines(row.nameA, left, y + 205, 390, 29, 2);
      if (row.clubBId) lines(row.nameB, right, y + 205, 390, 29, 2);
    }
  });

  lines(venueName || "Field League", width / 2,
    canvas.height - (single ? 105 : 54), width - 100, single ? 32 : 25, 2);
  write("FIXTURES · SOUTH AFRICAN TIME", width / 2,
    canvas.height - 25, "700 19px sans-serif", "#94a3b8");

  const blob = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Image preparation timed out. Please try again.")),
      15000
    );
    try {
      canvas.toBlob(value => {
        clearTimeout(timeout);
        resolve(value);
      }, "image/png");
    } catch (failure) {
      clearTimeout(timeout);
      reject(failure);
    }
  });
  if (!blob) throw new Error("The fixture image could not be created.");
  const filename = fixtureId
    ? `${rows[0].nameA}-vs-${rows[0].nameB}-${fixtureId}`
    : clubId
    ? `${clubName(clubId, teams, season)}-fixtures`
    : "league-fixtures";
  const safeFilename = `${filename.replace(/[^a-z0-9_-]+/gi, "-")}.png`;
  const {Capacitor, registerPlugin} = await import("@capacitor/core");

  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() !== "android" ||
        !Capacitor.isPluginAvailable("FixtureImages")) {
      throw new Error("Install the updated Android app to save fixture images.");
    }
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Could not prepare the image for saving."));
      reader.readAsDataURL(blob);
    });
    const images = registerPlugin("FixtureImages");
    return images.savePng({base64, filename: safeFilename});
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return {saved: true};
}
