#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ZERO_BLOB = "0".repeat(40);
const repositoryRoot = process.cwd();
const auditRoot = path.join(
  repositoryRoot,
  "third_party/weknora/upgrades/81142df",
);
const localLedgerPath = path.join(auditRoot, "pre-upgrade-local-delta.tsv");
const upstreamLedgerPath = path.join(auditRoot, "upstream-delta.tsv");
const overridePath = path.join(auditRoot, "resolution-overrides.tsv");
const outputPath = path.join(auditRoot, "resolution-ledger.tsv");
const summaryPath = path.join(auditRoot, "resolution-summary.json");

function parseTSV(text) {
  const lines = text.trimEnd().split("\n");
  const headers = lines.shift().split("\t");
  return lines.filter(Boolean).map((line) => {
    const fields = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, fields[index] ?? ""]));
  });
}

function decodeGitQuotedPath(value) {
  if (!value.startsWith('"') || !value.endsWith('"')) {
    return value;
  }
  const source = value.slice(1, -1);
  const bytes = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\\") {
      bytes.push(...Buffer.from(source[index]));
      continue;
    }
    const escape = source[index + 1];
    const octal = source.slice(index + 1, index + 4);
    if (/^[0-7]{3}$/u.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
      continue;
    }
    const escaped = { '"': '"', "\\": "\\", n: "\n", r: "\r", t: "\t" }[escape];
    if (escaped === undefined) {
      throw new Error(`unsupported Git path escape in ${value}`);
    }
    bytes.push(...Buffer.from(escaped));
    index += 1;
  }
  return Buffer.from(bytes).toString("utf8");
}

async function readTSV(filePath) {
  return parseTSV(await readFile(filePath, "utf8")).map((row) => ({
    ...row,
    path: decodeGitQuotedPath(row.path),
  }));
}

async function finalFileState(relativePath) {
  const filePath = path.join(repositoryRoot, "weknora", relativePath);
  let stat;
  try {
    stat = await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { mode: "000000", blob: ZERO_BLOB };
    }
    throw error;
  }

  let content;
  let mode;
  if (stat.isSymbolicLink()) {
    content = Buffer.from(await readlink(filePath));
    mode = "120000";
  } else if (stat.isFile()) {
    content = await readFile(filePath);
    mode = stat.mode & 0o111 ? "100755" : "100644";
  } else {
    throw new Error(`audited path is not a file or symlink: ${relativePath}`);
  }
  const header = Buffer.from(`blob ${content.length}\0`);
  const blob = createHash("sha1").update(header).update(content).digest("hex");
  return { mode, blob };
}

function targetMigrationMapping(relativePath) {
  let match = relativePath.match(/^migrations\/versioned\/000(08[0-9]|090)(_.+)$/u);
  if (match) {
    const mapped = Number.parseInt(match[1], 10) + 14;
    return `migrations/versioned/${String(mapped).padStart(6, "0")}${match[2]}`;
  }
  match = relativePath.match(/^migrations\/sqlite\/0000(0[3-9]|1[0-2])(_.+)$/u);
  if (match) {
    const mapped = Number.parseInt(match[1], 10) + 10;
    return `migrations/sqlite/${String(mapped).padStart(6, "0")}${match[2]}`;
  }
  return "";
}

function classify(local, upstream, finalState) {
  const absent = finalState.mode === "000000";
  if (local && !upstream) {
    if (local.working_mode === "000000") {
      return absent
        ? ["preserve-musuw-deletion", "audited local-only deletion remains authoritative"]
        : ["invalid-local-deletion-restored", "a locally deleted path unexpectedly exists"];
    }
    if (absent) {
      return ["missing-musuw-local-only", "audited local-only path disappeared"];
    }
    if (finalState.blob === local.working_blob && finalState.mode === local.working_mode) {
      return ["preserve-musuw-exact", "audited local-only content is byte-identical"];
    }
    return ["adapt-musuw-for-target", "audited Musuw path retained and adapted at its existing owner for the target contract"];
  }

  if (!local && upstream) {
    if (upstream.target_mode === "000000") {
      return absent
        ? ["adopt-upstream-deletion", "fixed target deletion is present"]
        : ["missing-upstream-deletion", "fixed target deleted this path but it still exists"];
    }
    if (absent) {
      return ["missing-upstream-only", "fixed-target upstream-only path disappeared"];
    }
    if (finalState.blob === upstream.target_blob && finalState.mode === upstream.target_mode) {
      return ["adopt-upstream-exact", "fixed-target upstream-only content is byte-identical"];
    }
    return ["adapt-upstream-for-musuw", "fixed-target path is present with Musuw product/runtime adaptation"];
  }

  if (!local || !upstream) {
    throw new Error("classify requires at least one source row");
  }

  if (absent) {
    if (local.working_mode === "000000") {
      return ["preserve-musuw-deletion", "audited Musuw deletion wins the overlapping target change"];
    }
    if (upstream.target_mode === "000000") {
      return ["adopt-upstream-deletion", "fixed target deletion is compatible with the Musuw delta"];
    }
    return ["missing-overlap", "path exists on both audited sides but disappeared"];
  }
  if (finalState.blob === local.working_blob && finalState.mode === local.working_mode) {
    return ["preserve-musuw-exact", "overlap review retained the audited Musuw content exactly"];
  }
  if (finalState.blob === upstream.target_blob && finalState.mode === upstream.target_mode) {
    return ["adopt-upstream-exact-needs-evidence", "exact upstream replacement requires a path-specific override rationale"];
  }
  return ["compose-three-way", "overlap review composed target capability with Musuw product semantics at the existing owner"];
}

function overrideMap(rows) {
  return new Map(rows.map((row) => [row.path, row]));
}

const [localRows, upstreamRows, overrideRows] = await Promise.all([
  readTSV(localLedgerPath),
  readTSV(upstreamLedgerPath),
  readTSV(overridePath),
]);
const locals = new Map(localRows.map((row) => [row.path, row]));
const upstream = new Map(upstreamRows.map((row) => [row.path, row]));
const overrides = overrideMap(overrideRows);
const paths = [...new Set([...locals.keys(), ...upstream.keys()])].sort();

if (localRows.length !== 708 || upstreamRows.length !== 1051 || paths.length !== 1601) {
  throw new Error(
    `audit cardinality drift: local=${localRows.length}, upstream=${upstreamRows.length}, union=${paths.length}`,
  );
}

const outputRows = [];
const blocking = [];
const counts = {};
for (const relativePath of paths) {
  const local = locals.get(relativePath);
  const target = upstream.get(relativePath);
  const state = await finalFileState(relativePath);
  let [resolution, evidence] = classify(local, target, state);
  const mapping = target ? targetMigrationMapping(relativePath) : "";
  if (mapping) {
    const mappedState = await finalFileState(mapping);
    const mappingKind = mappedState.blob === target.target_blob
      ? "byte-identical target SQL"
      : "Musuw-compatible adapted target SQL";
    if (state.mode === "000000" && mappedState.mode !== "000000") {
      resolution = "append-upstream-migration";
      evidence = `colliding target migration appended as ${mapping} (${mappingKind}) without reinterpreting Musuw history`;
    } else {
      evidence += `; colliding target migration appended as ${mapping} (${mappingKind})`;
    }
  }
  const override = overrides.get(relativePath);
  if (override) {
    resolution = override.resolution;
    evidence = override.evidence;
  }
  counts[resolution] = (counts[resolution] ?? 0) + 1;
  if (/^(?:missing-|invalid-)/u.test(resolution) || resolution.endsWith("-needs-evidence")) {
    blocking.push({ path: relativePath, resolution });
  }
  outputRows.push([
    relativePath,
    local?.status ?? "-",
    target?.status ?? "-",
    state.mode,
    state.blob,
    resolution,
    mapping,
    evidence,
  ]);
}

const header = [
  "path",
  "musuw_change",
  "upstream_change",
  "final_mode",
  "final_blob",
  "resolution",
  "mapped_target_path",
  "evidence",
];
await writeFile(
  outputPath,
  [header.join("\t"), ...outputRows.map((row) => row.join("\t")), ""].join("\n"),
);
const summary = {
  schemaVersion: 1,
  fixedTarget: "81142dfd17b2778087e95d3a317483a2fd909b91",
  localDeltaPaths: localRows.length,
  upstreamDeltaPaths: upstreamRows.length,
  overlapPaths: localRows.filter((row) => upstream.has(row.path)).length,
  unionPaths: paths.length,
  counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
  blocking,
};
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log(`WeKnora resolution ledger: ${paths.length} paths, ${blocking.length} blockers`);
for (const item of blocking.slice(0, 50)) {
  console.error(`${item.resolution}\t${item.path}`);
}
if (blocking.length > 50) {
  console.error(`... ${blocking.length - 50} additional blockers`);
}
process.exitCode = blocking.length === 0 ? 0 : 1;
