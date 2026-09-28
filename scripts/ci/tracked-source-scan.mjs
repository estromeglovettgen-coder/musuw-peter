#!/usr/bin/env node
/**
 * Fail closed when the Git index contains files outside the reviewed Musuw
 * publish boundary. The scan deliberately reads only `git ls-files`: local
 * dependency installs and build output cannot make a clean release appear
 * larger or smaller than the revision GitHub will publish.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import { TextDecoder } from "node:util";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const maximumBinaryBytes = 8 * 1024 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true });

function fail(message) {
  throw new Error(`tracked source scan: ${message}`);
}

function trackedIndexEntries() {
  let output;
  try {
    output = execFileSync("git", ["ls-files", "-s", "-z"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
  } catch (error) {
    fail(`cannot enumerate the Git index: ${error.message}`);
  }

  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const match = /^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/u.exec(record);
      if (!match) fail(`cannot parse Git index record ${JSON.stringify(record)}`);
      const [, mode, object, stage, path] = match;
      if (stage !== "0") fail(`unmerged index entry is not publishable: ${path}`);
      return { mode, object, path };
    });
}

function readTrackedBlobs(entries) {
  const result = spawnSync("git", ["cat-file", "--batch"], {
    cwd: repositoryRoot,
    input: entries.map(({ object }) => `${object}\n`).join(""),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) fail(`cannot read Git blobs: ${result.error.message}`);
  if (result.status !== 0) fail(`git cat-file failed: ${result.stderr.toString("utf8").trim()}`);

  const output = result.stdout;
  const blobs = [];
  let offset = 0;
  for (const { path } of entries) {
    const headerEnd = output.indexOf(0x0a, offset);
    if (headerEnd < 0) fail(`missing Git blob header: ${path}`);
    const [, type, rawSize] = output.subarray(offset, headerEnd).toString("ascii").split(" ");
    const size = Number(rawSize);
    if (type !== "blob" || !Number.isSafeInteger(size) || size < 0) fail(`invalid Git blob header: ${path}`);
    const contentStart = headerEnd + 1;
    const contentEnd = contentStart + size;
    if (contentEnd >= output.length || output[contentEnd] !== 0x0a) fail(`truncated Git blob: ${path}`);
    blobs.push(output.subarray(contentStart, contentEnd));
    offset = contentEnd + 1;
  }
  if (offset !== output.length) fail("unexpected trailing output from git cat-file");
  return blobs;
}

const forbiddenPathRules = [
  [/^(?:server|desktop)(?:\/|$)/u, "top-level server/desktop artifact"],
  [/^weknora\/(?:server|desktop)(?:\/|$)/u, "upstream server/desktop binary artifact"],
  [/(^|\/)(?:dist|node_modules|\.runtime|keys)(?:\/|$)/u, "generated, runtime, or key directory"],
  [
    /^(?:backend|web|src|migrations|fixtures|conformance|contracts|toolchains|docker|tests|test-results|\.codex)(?:\/|$)/u,
    "excluded legacy root",
  ],
  [/^scripts\/m35(?:\/|$)/u, "excluded legacy release experiment"],
  [/^compose\.m35\./u, "excluded legacy compose file"],
  [/^weknora\/\.github\/workflows(?:\/|$)/u, "nested delivery workflow"],
];

const privateKeyName = /(^|\/)(?:id_(?:rsa|dsa|ecdsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx|ppk|jks))$/iu;

function startsWithHex(buffer, hex) {
  return buffer.subarray(0, hex.length / 2).toString("hex") === hex;
}

function isPng(buffer) {
  return startsWithHex(buffer, "89504e470d0a1a0a");
}

function isJpeg(buffer) {
  return startsWithHex(buffer, "ffd8ff");
}

function isGif(buffer) {
  const signature = buffer.subarray(0, 6).toString("ascii");
  return signature === "GIF87a" || signature === "GIF89a";
}

function isIco(buffer) {
  return startsWithHex(buffer, "00000100");
}

function isWoff2(buffer) {
  return buffer.subarray(0, 4).toString("ascii") === "wOF2";
}

function isZip(buffer) {
  return startsWithHex(buffer, "504b0304");
}

function isParquet(buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 4).toString("ascii") === "PAR1" && buffer.subarray(-4).toString("ascii") === "PAR1";
}

function isWav(buffer) {
  return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
}

function isWebp(buffer) {
  return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

const allowedBinaryExtensions = new Map([
  [".png", isPng],
  [".jpg", isJpeg],
  [".jpeg", isJpeg],
  [".gif", isGif],
  [".ico", isIco],
  [".woff2", isWoff2],
  [".parquet", isParquet],
  [".wav", isWav],
]);

// These upstream/imported assets are intentionally retained byte-for-byte even
// though their historical filename extension does not match the encoded image.
// Keeping the exception path-specific prevents a newly misnamed binary from
// silently widening the release boundary.
const approvedSignatureExceptions = new Map([
  ["auth/public/fonts/geist-variable.woff", isWoff2],
  ["storefront/public/images/musuw-data-control.png", isJpeg],
  ["storefront/public/images/musuw-dialogue.png", isJpeg],
  ["storefront/public/images/musuw-grounded-answer.png", isJpeg],
  ["storefront/public/images/musuw-hero.png", isJpeg],
  ["storefront/public/images/musuw-knowledge-graph.png", isJpeg],
  ["storefront/public/images/musuw-library.png", isJpeg],
  ["storefront/public/images/musuw-living-wiki.png", isJpeg],
  ["storefront/public/images/musuw-review-answer.png", isJpeg],
  ["weknora/docs/images/arc.png", isWebp],
  ["weknora/docs/images/rbac-member-management.png", isJpeg],
  ["weknora/docs/images/rbac-pending-invitation.png", isJpeg],
  ["weknora/docs/images/rbac-workspace-switcher.png", isJpeg],
  ["weknora/docreader/tests/fixtures/issue_2634_vertical_merge.docx", isZip],
  ["weknora/frontend/src/assets/img/datasource-yuque.ico", isPng],
]);

// Only these reviewed public downloads may bypass the normal format/size
// boundary. Pin their bytes so neither another video/archive nor replacement
// contents can silently inherit approval. Re-rendered media requires review.
const approvedPublicMedia = new Map([
  ["storefront/public/media/press/musuw-product-brief-zh.pdf", "578b425e158d5434b0c72c751ba1b93574cf3f96a9e8b595ebc23cd2fbb72786"],
  ["storefront/public/media/press/musuw-product-brief-en.pdf", "98d5040e5016faa683c07b37d126255cf5c2dee8907e99f5e824a51220b18677"],
  ["storefront/public/media/press/musuw-cedar-live-zh-9x16.mp4", "e3e10de0ea0fd253a8e763bc7814555e67942fc55472df4386391bd6ce62c587"],
  ["storefront/public/media/press/musuw-cedar-live-en-9x16.mp4", "6e76c07b055359144dc110ddad2bfc1f788714693551a33869746c70204bce62"],
  ["storefront/public/media/press/musuw-cedar-live-zh-16x9.mp4", "4978252ff2df435271fb5110401552cbcfcd89d985935800bd2b489253850631"],
  ["storefront/public/media/press/musuw-cedar-live-en-16x9.mp4", "99ba13e75e8d6d0bb2dafeffd0ad6eb1bd6fb34ced119792e8e346520707e908"],
  ["storefront/public/media/press/musuw-en-16x9.mp4", "6131f360888b52ed854f57ee127cb2be694c53cc84fe5124321eb51df619a866"],
  ["storefront/public/media/press/musuw-en-4x5.mp4", "5d7d3afa85690a45bd23f232b2fa51c9140576f75a0bf159c9e0b6ffdd2edcb9"],
  ["storefront/public/media/press/musuw-zh-16x9.mp4", "be851a88510524050559d10fb1663620938b2c8321ce55ab53551aa6398b501c"],
  ["storefront/public/media/press/musuw-zh-4x5.mp4", "803d2b98d49a249abf2d2e63b2b5138ed4913373377b7f1c27de171a378a8d99"],
  ["storefront/public/media/press/musuw-media-kit.zip", "5b65aaf46012091c9e6cf076d074ef8e0f8ec55f25c635e76159505b8f944a75"],
]);

function looksBinary(buffer) {
  if (buffer.length === 0) return false;
  if (buffer.includes(0)) return true;
  try {
    utf8.decode(buffer);
    return false;
  } catch {
    return true;
  }
}

function validateBinary(path, buffer) {
  const approvedDigest = approvedPublicMedia.get(path);
  if (approvedDigest) {
    if (createHash("sha256").update(buffer).digest("hex") !== approvedDigest) {
      fail(`reviewed public media changed bytes: ${path}`);
    }
    return;
  }

  if (buffer.length > maximumBinaryBytes) {
    fail(`unexpected large binary (${buffer.length} bytes): ${path}`);
  }

  if (path === "weknora/frontend/packages/xlsx-0.20.2.tgz") {
    if (!startsWithHex(buffer, "1f8b08")) fail(`approved xlsx archive has an unexpected signature: ${path}`);
    return;
  }

  const approvedException = approvedSignatureExceptions.get(path);
  if (approvedException) {
    if (!approvedException(buffer)) fail(`reviewed binary exception changed signature: ${path}`);
    return;
  }

  const extension = extname(path).toLowerCase();
  const signatureCheck = allowedBinaryExtensions.get(extension);
  if (!signatureCheck) fail(`unexpected tracked binary: ${path}`);
  if (!signatureCheck(buffer)) fail(`binary extension/signature mismatch: ${path}`);
}

const entries = trackedIndexEntries();
for (const { mode, object, path } of entries) {
  if (mode === "120000") fail(`tracked symlink is outside the publish allowlist: ${path}`);
  if (mode === "160000") fail(`tracked Git submodule is outside the publish allowlist: ${path}`);
  if (mode !== "100644" && mode !== "100755") fail(`unsupported Git mode ${mode}: ${path}`);

  for (const [pattern, label] of forbiddenPathRules) {
    if (pattern.test(path)) fail(`${label}: ${path}`);
  }

  const filename = basename(path);
  if (filename.startsWith(".env") && !filename.endsWith(".example")) {
    fail(`non-example environment file is tracked: ${path}`);
  }
  if (privateKeyName.test(path)) fail(`private key or certificate container is tracked: ${path}`);
  if (!object) fail(`tracked path has no Git object identity: ${path}`);
}

const blobs = readTrackedBlobs(entries);
let binaryCount = 0;
for (const [index, { path }] of entries.entries()) {
  const contents = blobs[index];
  if (approvedPublicMedia.has(path) || looksBinary(contents)) {
    binaryCount += 1;
    validateBinary(path, contents);
  }
}

console.log(`tracked source scan green: ${entries.length} files; ${binaryCount} reviewed binary assets`);
