import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  "src/pages/SquadsPage.jsx",
  "utf8"
);

test("Practice does not subscribe to Official squad controls", () => {
  const marker = source.indexOf(
    "Do not bind Practice to the real club's operational setting"
  );
  const officialRef = source.indexOf(
    'doc(db, "clubs", activeClubId, "settings", "squadControls")'
  );

  assert.ok(marker >= 0);
  assert.ok(officialRef >= 0);
  assert.ok(marker < officialRef);

  const block = source.slice(marker, officialRef);
  assert.match(
    block,
    /if\s*\(\s*isPracticeMode\s*\)\s*return undefined;/
  );
});

test("Practice captain lock toggle is local-only", () => {
  const start = source.indexOf(
    "const handleToggleCaptainEditLock = async"
  );
  const end = source.indexOf(
    "useEffect(() =>",
    start
  );

  const block = source.slice(start, end);

  assert.match(block, /setCaptainEditLocked\(nextLocked\)/);
  assert.match(
    block,
    /if\s*\(\s*isPracticeMode\s*\)\s*\{[\s\S]*?return;[\s\S]*?\}/
  );

  const guard = block.indexOf("if (isPracticeMode)");
  const write = block.indexOf("await setDoc(");

  assert.ok(guard >= 0);
  assert.ok(write >= 0);
  assert.ok(guard < write);
});

test("Official squad control persistence remains present", () => {
  assert.match(
    source,
    /doc\(db,\s*"clubs",\s*activeClubId,\s*"settings",\s*"squadControls"\)/
  );
  assert.match(source, /captainEditLocked:\s*nextLocked/);
  assert.match(source, /updatedByRole:\s*"admin"/);
});
