import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  new URL("../src/core/playerEventStats.js", import.meta.url),
  "utf8"
);

assert.match(
  source,
  /event\.scorerType\s*!==\s*["']guest["']/,
  "goal aggregation must exclude explicitly tagged guest scorers"
);

assert.match(
  source,
  /event\.assistType\s*!==\s*["']guest["']/,
  "assist aggregation must exclude explicitly tagged guest assisters"
);

assert.doesNotMatch(
  source,
  /event\.scorerType\s*===\s*["']registered["']/,
  "goal aggregation must not require registered tag because legacy events may be untyped"
);

assert.doesNotMatch(
  source,
  /event\.assistType\s*===\s*["']registered["']/,
  "assist aggregation must not require registered tag because legacy events may be untyped"
);

console.log("PASS player-event-stats guest contract");
