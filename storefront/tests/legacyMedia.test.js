import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

const legacyAssetNames = [
  "clienthub-logo.png",
  "deliverables.png",
  "hero-dashboard.png",
  "hero-dashboard-hd.png",
  "activity-card.png",
  "activity-card-hd.png",
  "deliverable-card.png",
  "deliverable-card-hd.png",
  "approval-detail.png",
  "approval-flow.png",
  "avatar-daniel.png",
  "avatar-emily.png",
  "avatar-jonathan.png",
  "avatar-olivia.png",
  "avatar-sophie.png",
  "billing.png",
  "payments.jpg",
  "project-list.png",
  "project-tracking.png",
  "systems.jpg",
  "visibility.jpg",
  "musuw-data-control.png",
  "musuw-dialogue.png",
  "musuw-grounded-answer.png",
  "musuw-hero.png",
  "musuw-knowledge-graph.png",
  "musuw-library.png",
  "musuw-living-wiki.png",
  "musuw-review-answer.png",
];

const legacyPatterns = [
  /^clienthub-logo(?:-|\.)/i,
  /^deliverables(?:-|\.)/i,
  /^hero-dashboard(?:-|\.)/i,
  /^activity-card(?:-|\.)/i,
  /^deliverable-card(?:-|\.)/i,
  /^approval-(?:detail|flow)(?:-|\.)/i,
  /^avatar-(?:daniel|emily|jonathan|olivia|sophie)(?:-|\.)/i,
  /^billing(?:-|\.)/i,
  /^payments(?:-|\.)/i,
  /^project-(?:list|tracking)(?:-|\.)/i,
  /^systems(?:-|\.)/i,
  /^visibility(?:-|\.)/i,
  /^musuw-(?:data-control|dialogue|grounded-answer|hero|knowledge-graph|library|living-wiki|review-answer)(?:-|\.)/i,
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(?:css|html|js|jsx)$/.test(entry.name) ? [file] : [];
  });
}

function legacyFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => legacyPatterns.some((pattern) => pattern.test(name)));
}

test("legacy ClientHub/Acme media is neither referenced nor shipped", () => {
  const source = [join(root, "index.html"), ...sourceFiles(join(root, "src"))]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  for (const name of legacyAssetNames) {
    assert.doesNotMatch(source, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${name} must not be referenced by the application`);
  }

  const publicLegacy = legacyFiles(join(root, "public", "images"));
  const distLegacy = legacyFiles(join(root, "dist", "images"));
  assert.deepEqual(publicLegacy, [], `legacy files remain in public/images: ${publicLegacy.join(", ")}`);
  assert.deepEqual(distLegacy, [], `legacy files remain in dist/images: ${distLegacy.join(", ")}`);

  for (const name of legacyAssetNames) {
    assert.equal(existsSync(join(root, "public", "images", name)), false, `${name} must not be publicly shipped`);
    assert.equal(existsSync(join(root, "dist", "images", name)), false, `${name} must not be copied into dist`);
  }
});
