import { describe, expect, it } from "vitest";

import { resolveInitialAuthLocale } from "./locale";

describe("auth locale resolution", () => {
  it("lets an explicit reviewer locale override and persist an older product preference", () => {
    const writes: Array<[string, string]> = [];

    expect(resolveInitialAuthLocale({
      search: "?lang=en",
      storage: {
        getItem: () => "zh-CN",
        setItem: (key, value) => writes.push([key, value]),
      },
      cookie: "musuw_locale=zh-CN",
      languages: ["zh-CN"],
    })).toBe("en-US");
    expect(writes).toEqual([["locale", "en-US"]]);
  });

  it("ignores an unsupported locale query without poisoning the saved preference", () => {
    const writes: Array<[string, string]> = [];

    expect(resolveInitialAuthLocale({
      search: "?lang=unsupported&next=https://example.invalid",
      storage: {
        getItem: () => "zh-CN",
        setItem: (key, value) => writes.push([key, value]),
      },
      cookie: "musuw_locale=en",
      languages: ["en-US"],
    })).toBe("zh-CN");
    expect(writes).toEqual([]);
  });

  it("keeps an explicit locale when browser storage access throws", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    try {
      expect(resolveInitialAuthLocale({
        search: "?lang=en",
        cookie: "musuw_locale=zh-CN",
        languages: ["zh-CN"],
      })).toBe("en-US");
    } finally {
      if (descriptor === undefined) delete (globalThis as { localStorage?: Storage }).localStorage;
      else Object.defineProperty(globalThis, "localStorage", descriptor);
    }
  });

  it("prefers a saved product preference over the website signal and browser", () => {
    expect(resolveInitialAuthLocale({
      storage: { getItem: () => "ru-RU" },
      cookie: "musuw_locale=zh-CN",
      languages: ["zh-CN"],
    })).toBe("en-US");
    expect(resolveInitialAuthLocale({
      storage: { getItem: () => "zh-CN" },
      cookie: "musuw_locale=en",
      languages: ["en-US"],
    })).toBe("zh-CN");
  });

  it("uses the website signal before browser language", () => {
    expect(resolveInitialAuthLocale({
      storage: { getItem: () => null },
      cookie: "foo=bar; musuw_locale=zh-CN",
      languages: ["en-US"],
    })).toBe("zh-CN");
  });

  it("maps Chinese browser languages to Chinese and defaults unsupported browsers to English", () => {
    expect(resolveInitialAuthLocale({
      storage: { getItem: () => null },
      cookie: "",
      languages: ["zh-Hans-CN", "en-US"],
    })).toBe("zh-CN");
    expect(resolveInitialAuthLocale({
      storage: { getItem: () => null },
      cookie: "",
      languages: ["fr-FR"],
    })).toBe("en-US");
  });
});
