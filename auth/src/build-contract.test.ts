import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("auth static build configuration", () => {
  it("fails instead of emitting a login shell with no public identity configuration", () => {
    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/vite/bin/vite.js"), "build"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { PATH: process.env["PATH"] ?? "" },
      },
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("Authentication configuration is unavailable");
  });

  it("loads the shared runtime config before the auth module", () => {
    const index = readFileSync(resolve("index.html"), "utf8");
    expect(index.indexOf('<script src="/config.js"></script>')).toBeGreaterThanOrEqual(0);
    expect(index.indexOf('<script src="/src/main.tsx" type="module"></script>')).toBeGreaterThan(
      index.indexOf('<script src="/config.js"></script>'),
    );
  });

  it("requires all public auth values at frontend startup and never serializes server credentials", () => {
    const entrypoint = readFileSync(
      resolve("../weknora/frontend/docker-entrypoint.sh"),
      "utf8",
    );
    for (const name of [
      "MUSUW_AUTH_PUBLIC_ORIGIN",
      "MUSUW_SUPABASE_URL",
      "MUSUW_SUPABASE_PUBLISHABLE_KEY",
      "MUSUW_WEKNORA_OAUTH_CLIENT_ID",
    ]) {
      expect(entrypoint).toContain(name);
    }
    expect(entrypoint).not.toMatch(/(?:PADDLE|JWT|AES|SECRET|PASSWORD|SERVICE_ROLE|API_KEY)/i);
    expect(entrypoint).toContain("__RUNTIME_CONFIG__");
    expect(entrypoint).toContain("auth");
  });

  it("applies the staging noindex include explicitly to every required nginx surface", () => {
    const nginx = readFileSync(
      resolve("../integration/weknora-production/nginx.conf.template"),
      "utf8",
    );
    const authNginx = readFileSync(
      resolve("../integration/weknora-production/auth-shell.nginx.conf"),
      "utf8",
    );
    expect(nginx.match(/include \/etc\/nginx\/musuw-noindex\.conf;/g)?.length).toBeGreaterThanOrEqual(8);
    expect(authNginx.match(/include \/etc\/nginx\/musuw-noindex\.conf;/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
