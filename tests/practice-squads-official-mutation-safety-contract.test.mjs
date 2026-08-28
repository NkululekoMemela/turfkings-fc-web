import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/pages/SquadsPage.jsx", "utf8");

test("Practice explicitly blocks membership termination", () => {
  assert.match(
    source,
    /handleConfirmDeletePlayer[\s\S]{0,500}if\s*\(\s*isPracticeMode\s*\)[\s\S]{0,500}return;/
  );
});

test("Practice skips Official captain role persistence", () => {
  assert.match(
    source,
    /if\s*\(\s*!isPracticeMode\s*\)\s*\{[\s\S]{0,500}writeBatch\(db\)/
  );
});

test("captain role writes remain available for Official mode", () => {
  assert.match(source, /"roles\.captain": true/);
  assert.match(source, /"roles\.captain": false/);
});

test("Practice still forwards disposable squad changes", () => {
  assert.match(source, /onUpdateFiveVFiveTeams\?\.\(/);
  assert.match(source, /onUpdateTeams\?\.\(/);
});
