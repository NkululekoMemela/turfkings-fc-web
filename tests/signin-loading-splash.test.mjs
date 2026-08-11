import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const entry = fs.readFileSync(
  new URL("../src/pages/EntryPage.jsx", import.meta.url),
  "utf8"
);

const shared = fs.readFileSync(
  new URL(
    "../src/components/LoadingSplash/LoadingSplash.jsx",
    import.meta.url
  ),
  "utf8"
);

const home = fs.readFileSync(
  new URL(
    "../src/components/HomePage_HUB/HomePage_HUB_StartupSplash.jsx",
    import.meta.url
  ),
  "utf8"
);

test("shared LoadingSplash exists", () => {
  assert.match(shared, /function LoadingSplash/);
});

test("shared splash keeps original HomePage CSS classes", () => {
  assert.match(shared, /hub-startup-splash__progress-bar/);
  assert.match(shared, /hub-startup-splash__steps/);
  assert.match(shared, /hub-startup-splash__art/);
});

test("Home startup remains a wrapper over LoadingSplash", () => {
  assert.match(home, /LoadingSplash/);
  assert.match(home, /HOME_STARTUP_ART/);
});

test("Home startup retains original title", () => {
  assert.match(home, /Preparing your football world/);
});

test("Home startup retains original three steps", () => {
  assert.match(home, /Connecting to your account/);
  assert.match(home, /Loading clubs and venues/);
  assert.match(home, /Preparing nearby football/);
});

test("EntryPage imports shared LoadingSplash", () => {
  assert.match(
    entry,
    /components\/LoadingSplash\/LoadingSplash\.jsx/
  );
});

test("EntryPage uses Official Session artwork", () => {
  assert.match(
    entry,
    /\/session\/official-session-bg\.png/
  );
});

test("EntryPage loading starts before sign-in implementation", () => {
  assert.match(entry, /setShowSigninLoading\(true\)/);
  assert.match(entry, /performVerifyPlayer/);
});

test("EntryPage always closes splash through wrapper finally", () => {
  assert.match(
    entry,
    /finally\s*\{[\s\S]*setSigninProgress\(100\)[\s\S]*setShowSigninLoading\(false\)/
  );
});

test("sign-in splash has real milestone progress", () => {
  for (const value of [35, 55, 65, 74, 86, 96, 100]) {
    assert.match(
      entry,
      new RegExp(`setSigninProgress\\(${value}\\)`)
    );
  }
});

test("GPI and Platform Player architecture remain present", () => {
  assert.match(entry, /resolvePlayerIdentity/);
  assert.match(entry, /coordinatePlatformPlayer/);
});
