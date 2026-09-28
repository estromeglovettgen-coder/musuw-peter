import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const mediaRoot = "storefront/public/media/press/";
const approvedMedia = [
  "musuw-en-16x9.mp4",
  "musuw-en-4x5.mp4",
  "musuw-zh-16x9.mp4",
  "musuw-zh-4x5.mp4",
  "musuw-cedar-live-en-16x9.mp4",
  "musuw-cedar-live-zh-16x9.mp4",
  "musuw-cedar-live-en-9x16.mp4",
  "musuw-cedar-live-zh-9x16.mp4",
  "musuw-product-brief-en.pdf",
  "musuw-product-brief-zh.pdf",
  "musuw-media-kit.zip",
];

function scanIndexedFiles(t, files) {
  const root = mkdtempSync(join(tmpdir(), "musuw-source-scan-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scanner = join(root, "scripts/ci/tracked-source-scan.mjs");
  mkdirSync(dirname(scanner), { recursive: true });
  copyFileSync(join(repositoryRoot, "scripts/ci/tracked-source-scan.mjs"), scanner);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  for (const [path, contents] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  execFileSync("git", ["add", "--", ...files.map(([path]) => path)], { cwd: root });
  return spawnSync(process.execPath, [scanner], { encoding: "utf8" });
}

test("the reviewed media kit, eight videos and two product briefs are publishable", (t) => {
  const files = approvedMedia.map((name) => [mediaRoot + name, readFileSync(join(repositoryRoot, mediaRoot, name))]);
  assert.ok(files.at(-1)[1].length > 8 * 1024 * 1024, "the kit exercises the narrow large-file exception");
  const result = scanIndexedFiles(t, files);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /11 files; 11 reviewed binary assets/);
});

test("an unreviewed video path is still rejected", (t) => {
  const result = scanIndexedFiles(t, [[mediaRoot + "unreviewed.mp4", readFileSync(join(repositoryRoot, mediaRoot, approvedMedia[0]))]]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unexpected tracked binary/);
});

test("the approved media paths reject replacement bytes, including text", (t) => {
  for (const replacement of [Buffer.from("changed public asset\0"), Buffer.from("changed public asset")]) {
    const result = scanIndexedFiles(t, [[mediaRoot + approvedMedia[0], replacement]]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviewed public media changed bytes/);
  }
});

test("unrelated large images still exceed the binary size limit", (t) => {
  const image = Buffer.alloc(8 * 1024 * 1024 + 1);
  Buffer.from("89504e470d0a1a0a", "hex").copy(image);
  const result = scanIndexedFiles(t, [["storefront/public/unreviewed.png", image]]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unexpected large binary/);
});
