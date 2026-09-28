import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

test("production is built from the owned React application", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const output = readFileSync(join(root, "dist", "index.html"), "utf8");

  assert.equal(packageJson.scripts.build, "vite build && node scripts/prerender-articles.mjs");
  assert.match(output, /<div id="root"><\/div>/);
  assert.doesNotMatch(output, /data-framer-generated-page|data-framer-bundle|MUSUW_BRANDING_START/);
});

test("application source never imports the reference snapshot", () => {
  for (const file of [
    "src/main.jsx",
    "src/App.jsx",
    "src/HomePage.jsx",
    "src/components/HeroScene.jsx",
    "src/components/HomeSections.jsx",
    "src/components/SiteChrome.jsx",
    "src/data/homeContent.js"
  ]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /reference\//, `${file} must not depend on reference/`);
    assert.doesNotMatch(
      source,
      /framer(?:usercontent)?\.com|clienthub\.framer\.website/,
      `${file} must not depend on Framer hosts`
    );
  }
});

test("the owned header mounts the same product entry actions on desktop and mobile", () => {
  const source = readFileSync(join(root, "src/components/SiteChrome.jsx"), "utf8");
  assert.equal(
    source.match(/<ProductEntryLinks authenticated=\{authenticated\} copy=\{copy\} \/>/g)?.length,
    2,
    "desktop and mobile navigation must both consume the same session-derived entry state",
  );
});
