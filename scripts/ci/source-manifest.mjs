#!/usr/bin/env node
/**
 * Verify the checked-in WeKnora source identity without rebuilding historical
 * snapshots.  Local Musuw additions are allowed; the imported upstream floor
 * and its provenance fields must remain present and internally consistent.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const sourceRoot = resolve(repositoryRoot, "weknora");
const provenancePath = resolve(repositoryRoot, "third_party/weknora/v0.7.2-provenance.json");
const activeSourcePath = resolve(repositoryRoot, "third_party/weknora/active-upstream-source.json");
const targetProvenancePath = resolve(repositoryRoot, "third_party/weknora/target-81142df-provenance.json");

function fail(message) {
  throw new Error(`source manifest: ${message}`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${relative(repositoryRoot, path)}: ${error.message}`);
  }
}

function trackedSourceFiles() {
  let output;
  try {
    output = execFileSync("git", ["ls-files", "-z", "--", "weknora"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
  } catch (error) {
    fail(`cannot enumerate Git-tracked source: ${error.message}`);
  }
  return output.split("\0").filter(Boolean);
}

if (!existsSync(sourceRoot) || !statSync(sourceRoot).isDirectory()) fail("weknora source directory is missing");
const provenance = readJson(provenancePath);
const active = readJson(activeSourcePath);
const target = readJson(targetProvenancePath);

for (const [label, value] of [
  ["historical provenance", provenance],
  ["active source", active],
  ["fixed target provenance", target],
]) {
  if (value?.schemaVersion !== 1) fail(`${label} schemaVersion must be 1`);
  if (value?.sourceDirectory !== "weknora") fail(`${label} sourceDirectory must be weknora`);
}

const historical = provenance.upstream;
const targetUpstream = target.upstream;
if (
  historical?.tag !== target.base?.tag ||
  historical?.commit !== target.base?.commit ||
  historical?.tree !== target.base?.tree ||
  provenance.officialTrackedPathCount !== target.base?.regularFileCount
) {
  fail("historical v0.7.2 provenance does not match the fixed target base");
}
if (
  active.repository !== targetUpstream?.repository ||
  active.tag !== targetUpstream?.ref ||
  active.commit !== targetUpstream?.commit ||
  active.import?.baseTag !== historical?.tag ||
  active.import?.baseCommit !== historical?.commit ||
  active.import?.tree !== targetUpstream?.tree ||
  active.import?.regularFileCount !== targetUpstream?.regularFileCount ||
  active.import?.version !== targetUpstream?.version ||
  active.import?.latestMigration !== target.migrations?.postgresLatest ||
  active.import?.latestSQLiteMigration !== target.migrations?.sqliteLatest
) {
  fail("active source and fixed target provenance are inconsistent");
}
if (targetUpstream?.ref !== "main" || targetUpstream?.commit !== "81142dfd17b2778087e95d3a317483a2fd909b91") {
  fail("fixed target provenance is not the requested official main commit");
}
if (
  target.migrations?.postgresLatest !== 104 ||
  target.migrations?.sqliteLatest !== 23
) {
  fail("fixed target migration versions are inconsistent");
}
if (targetUpstream?.repository !== "https://github.com/Tencent/WeKnora.git") {
  fail("active upstream repository is not Tencent/WeKnora");
}
const trackedFiles = trackedSourceFiles();
const fileCount = trackedFiles.length;
if (fileCount < targetUpstream.regularFileCount) {
  fail(`source tree is incomplete (${fileCount} files below ${targetUpstream.regularFileCount})`);
}

const nestedGit = trackedFiles.filter((path) => path.split("/").includes(".git"));
if (nestedGit.length > 0) fail(`nested Git metadata is present: ${nestedGit.join(", ")}`);

const goMod = readFileSync(resolve(sourceRoot, "go.mod"), "utf8");
if (!/^module github\.com\/Tencent\/WeKnora$/mu.test(goMod)) {
  fail("active source go.mod module identity is unexpected");
}

console.log(
  `source manifest green: ${active.tag} ${active.commit} ` +
    `(${fileCount} active source files; ${targetUpstream.regularFileCount} fixed-target floor)`,
);
