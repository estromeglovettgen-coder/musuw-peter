import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./empty-knowledge.vue", import.meta.url), "utf8");

test("document empty state is a compact clickable dashed dropzone without a second file input", () => {
  assert.match(source, /<button[\s\S]*?class="empty-dropzone"[\s\S]*?@click="emit\('upload'\)"/);
  assert.match(source, /border:\s*1px\s+dashed/);
  assert.doesNotMatch(source, /upload\.svg/);
  assert.doesNotMatch(source, /<t-button|type="file"/);
});
