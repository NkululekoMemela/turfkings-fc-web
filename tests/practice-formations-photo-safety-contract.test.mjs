import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/pages/FormationsPage.jsx",
  "utf8"
);

test("Practice guards permanent player photo persistence", () => {
  const guard = source.indexOf("if (!isPracticeMode)");
  const write = source.indexOf(
    "await setDoc(",
    guard
  );

  assert.ok(guard >= 0, "Practice photo persistence guard missing");
  assert.ok(write >= 0, "Official player photo write missing");
  assert.ok(guard < write, "Guard must precede Official player photo write");
});

test("Official player photo persistence remains present", () => {
  assert.match(
    source,
    /getClubDoc\(db,\s*CLUB_COLLECTIONS\.playerPhotos,\s*docId\)/
  );

  assert.match(
    source,
    /updatedAt:\s*serverTimestamp\(\)/
  );
});

test("Practice still previews selected photo locally", () => {
  assert.match(
    source,
    /setPlayerPhotos\(\(prev\) => \(\{[\s\S]*?\[photoPlayer\]: dataUrl/
  );
});

test("Practice explicitly tells user real photo was not changed", () => {
  assert.match(
    source,
    /Practice preview updated for \$\{photoPlayer\} — the real player photo was not changed/
  );
});

test("real Official player photos remain readable", () => {
  assert.match(
    source,
    /getPlayerPhotosCollection\(db, activeClubId\)/
  );
});

test("real Official player roster remains readable", () => {
  assert.match(
    source,
    /getPlayersCollection\(db, activeClubId\)/
  );
});
