import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

test("contact page makes the local email handoff explicit and keeps legal details below it", () => {
  const page = readFileSync(join(root, "src/LegalPage.jsx"), "utf8");
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");

  assert.match(page, /className="contact-channel-shell"/);
  assert.match(page, /className="contact-channel"/);
  assert.match(page, /contact-address/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /const supportEmailHref = `mailto:\$\{LEGAL_OPERATOR\.supportEmail\}`/);
  assert.match(page, /supportPhoneHref\s*=\s*`tel:\$\{LEGAL_OPERATOR\.supportPhone\.replaceAll\(" ", ""\)\}`/);
  assert.match(page, /href=\{supportEmailHref\}/);
  assert.match(page, /href=\{supportPhoneHref\}/);
  assert.doesNotMatch(page, /className="contact-form"/);
  assert.doesNotMatch(page, /className="contact-form-shell"/);
  assert.match(page, /contact-legal-strip/);
  assert.match(page, /mailto:/);
  assert.match(page, /本机邮件应用|local email app/);
  assert.doesNotMatch(page, /Choose a contact route/);
  assert.match(styles, /\.contact-channel-shell\s*\{/);
  assert.match(styles, /\.contact-channel\s*\{/);
  assert.match(styles, /\.contact-legal-strip\s*\{/);
  assert.match(styles, /@media \(max-width: 767px\)/);
});
