import assert from "node:assert/strict";
import test from "node:test";
import { getStorefrontCopy, storefrontTranslations } from "../src/i18n.js";

function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
  }
  return typeof value;
}

function strings(value, path = [], result = []) {
  if (typeof value === "string") result.push([path.join("."), value]);
  else if (Array.isArray(value)) value.forEach((item, index) => strings(item, [...path, index], result));
  else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => strings(item, [...path, key], result));
  }
  return result;
}

test("English and Chinese storefront dictionaries have identical complete structure", () => {
  assert.deepEqual(shape(storefrontTranslations["zh-CN"]), shape(storefrontTranslations.en));
  assert.ok(strings(storefrontTranslations.en).length >= 160, "the full public storefront must be localized");
  for (const [path, value] of strings(storefrontTranslations["zh-CN"])) {
    assert.notEqual(value.trim(), "", `${path} must not be blank`);
  }
});

test("getStorefrontCopy never mixes locales and defaults unknown input to English", () => {
  assert.equal(getStorefrontCopy("zh-CN").nav.items[0].label, "功能");
  assert.equal(getStorefrontCopy("zh-CN").pricing.checkout.action, "查看方案");
  assert.equal(getStorefrontCopy("en").nav.items[0].label, "Features");
  assert.equal(getStorefrontCopy("fr").nav.items[0].label, "Features");
});

test("the public header offers localized login and free-start actions", () => {
  assert.deepEqual(
    {
      login: getStorefrontCopy("en").nav.login,
      getStarted: getStorefrontCopy("en").nav.getStarted,
    },
    { login: "Log in", getStarted: "Start free" },
  );
  assert.deepEqual(
    {
      login: getStorefrontCopy("zh-CN").nav.login,
      getStarted: getStorefrontCopy("zh-CN").nav.getStarted,
    },
    { login: "登录", getStarted: "建立我的知识库" },
  );
  assert.equal(getStorefrontCopy("en").nav.openApp, "Open musuw");
  assert.equal(getStorefrontCopy("zh-CN").nav.openApp, "打开 musuw");
});

test("pricing keeps checkout provider-neutral in both locales", () => {
  for (const locale of ["en", "zh-CN"]) {
    const copy = getStorefrontCopy(locale);
    assert.ok(copy.meta.title);
    assert.ok(copy.meta.description);
    assert.ok(copy.pricing.checkout.action);
    assert.match(copy.pricing.checkout.note, locale === "zh-CN" ? /本地化价格/ : /localized pricing/i);
    assert.doesNotMatch(JSON.stringify(copy.pricing), /Paddle|OpenRouter/i);
  }
});
