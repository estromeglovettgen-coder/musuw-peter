import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const dist = join(root, "dist");

function build() {
  execFileSync("npm", ["run", "build"], {
    cwd: root,
    stdio: "ignore"
  });
}

function assetSnapshot() {
  return readdirSync(join(dist, "assets"))
    .filter((name) => /\.(css|js)$/.test(name))
    .sort()
    .map((name) => ({
      name,
      sha256: createHash("sha256")
        .update(readFileSync(join(dist, "assets", name)))
        .digest("hex")
    }));
}

test("production assets are stable and ignore files outside application source", () => {
  const scanCanary = join(root, "tailwind-scan-canary.md");

  rmSync(dist, { recursive: true, force: true });
  rmSync(scanCanary, { force: true });
  build();
  const cleanBuild = assetSnapshot();

  try {
    const outsideUtility = ["text", "red", "500"].join("-");
    writeFileSync(scanCanary, `${outsideUtility}\n`);
    build();
  } finally {
    rmSync(scanCanary, { force: true });
  }

  const buildWithOutsideCanary = assetSnapshot();

  assert.deepEqual(buildWithOutsideCanary, cleanBuild);
});
