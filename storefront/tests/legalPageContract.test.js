import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const page = () => readFileSync(join(root, "src/LegalPage.jsx"), "utf8");
const app = () => readFileSync(join(root, "src/App.jsx"), "utf8");
const legalStyles = () => readFileSync(join(root, "src/legal.css"), "utf8");
const styles = () => readFileSync(join(root, "src/styles.css"), "utf8");

test("legal table of contents owns the only section number", () => {
  const source = page();

  assert.match(source, /function stripSectionNumber\(/);
  assert.match(source, /stripSectionNumber\(section\.heading\)/);
  assert.match(source, /<h2>\{section\.heading\}<\/h2>/);
});

test("legal pages provide a token-based dark surface and readable copy", () => {
  const source = legalStyles();

  for (const selector of [
    'html[data-theme="dark"] .legal-page',
    'html[data-theme="dark"] .legal-document',
    'html[data-theme="dark"] .legal-hero',
    'html[data-theme="dark"] .legal-section-copy',
    'html[data-theme="dark"] .legal-contents',
    'html[data-theme="dark"] .legal-notice',
    'html[data-theme="dark"] .legal-action',
  ]) {
    assert.ok(source.includes(selector), `missing dark selector: ${selector}`);
  }

  assert.match(source, /\.legal-document\s*\{[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(source, /\.legal-sections > section\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--line\)/);
});

test("contact controls stay legible in dark mode and keep one compact layout", () => {
  const source = styles();

  assert.match(source, /html\[data-theme="dark"\] \.contact-page\s*\{/);
  assert.match(source, /html\[data-theme="dark"\] \.contact-channel-shell\s*\{/);
  assert.match(source, /html\[data-theme="dark"\] \.contact-email-action\s*\{[\s\S]*?background:\s*var\(--ink\)/);
  assert.match(source, /html\[data-theme="dark"\] \.contact-email-action\s*\{[\s\S]*?color:\s*var\(--page\)/);
  assert.match(source, /\.contact-layout\s*\{[\s\S]*?grid-template-columns:/);
});

test("public document headers receive the active theme controls", () => {
  const appSource = app();
  const pageSource = page();

  assert.match(appSource, /<LegalPage[\s\S]*?theme=\{theme\}[\s\S]*?onThemeToggle=\{handleThemeToggle\}/);
  assert.match(pageSource, /function ContactPage\([\s\S]*?theme[\s\S]*?onThemeToggle/);
  assert.match(pageSource, /<SiteHeader[\s\S]*?theme=\{theme\}[\s\S]*?onThemeToggle=\{onThemeToggle\}/);
});
