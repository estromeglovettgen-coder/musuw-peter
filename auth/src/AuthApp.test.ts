import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AUTH_LEGAL_LINKS,
  AuthApp,
  authLegalHref,
  checkoutIntentFromSearch,
  checkoutWorkspacePathFromSearch,
  getAuthCopy,
  initialAuthErrorForPathname,
  initialAuthScreenForPathname,
  maskAuthEmail,
} from "./AuthApp";
import type { AuthRuntime } from "./runtime";

describe("auth shell browser routes", () => {
  it("treats the public start route as a session-resume route, not a login form", () => {
    expect(initialAuthScreenForPathname("/auth/start")).toBe("start_pending");
  });

  it("uses only the public auth paths for start, callback, and logout", () => {
    expect(initialAuthScreenForPathname("/auth/callback")).toBe("callback_pending");
    expect(initialAuthScreenForPathname("/auth/recovery")).toBe("recovery_pending");
    expect(initialAuthScreenForPathname("/auth/logout")).toBe("logout_pending");
    expect(initialAuthScreenForPathname("/logout")).toBe("login");
  });

  it("shows a generic explicit-retry message on the native callback failure route", () => {
    expect(initialAuthScreenForPathname("/auth/error")).toBe("login");
    expect(initialAuthErrorForPathname("/auth/error")).toBe("登录暂不可用，请重试。");
    expect(initialAuthErrorForPathname("/auth/start")).toBeNull();
  });

  it("keeps Supabase's OAuth consent route outside the auth asset prefix", () => {
    expect(initialAuthScreenForPathname("/oauth/consent")).toBe("consent_pending");
  });

  it("preserves only a supported storefront checkout intent", () => {
    expect(checkoutIntentFromSearch("?plan=pro&period=yearly")).toEqual({
      period: "yearly",
      plan: "pro",
    });
    expect(checkoutIntentFromSearch("?plan=free&period=monthly")).toBeNull();
    expect(checkoutIntentFromSearch("?plan=admin&period=monthly")).toBeNull();
    expect(checkoutIntentFromSearch("?plan=plus&period=weekly")).toBeNull();
    expect(checkoutWorkspacePathFromSearch("?plan=max&period=yearly")).toBe(
      "/?plan=max&period=yearly",
    );
    expect(checkoutWorkspacePathFromSearch("?plan=admin&period=monthly")).toBe("/");
  });
});

describe("auth shell localized copy", () => {
  it("has complete visible Chinese and English entry copy", () => {
    for (const locale of ["zh-CN", "en-US"] as const) {
      const copy = getAuthCopy(locale);
      expect(copy.title).not.toBe("");
      expect(copy.intro).not.toBe("");
      expect(copy.google).not.toBe("");
      expect(copy.divider).not.toBe("");
      expect(copy.status).not.toBe("");
      expect(copy.email).not.toBe("");
      expect(copy.password).not.toBe("");
      expect(copy.confirmPassword).not.toBe("");
      expect(copy.signIn).not.toBe("");
      expect(copy.signInUnavailable).not.toBe("");
      expect(copy.createAccount).not.toBe("");
      expect(copy.signUpUnavailable).not.toBe("");
      expect(copy.updatePassword).not.toBe("");
      expect(copy.updatingPassword).not.toBe("");
      expect(copy.passwordRecoveryTitle).not.toBe("");
      expect(copy.forgotPassword).not.toBe("");
      expect(copy.useEmailCode).not.toBe("");
      expect(copy.showPassword).not.toBe("");
      expect(copy.hidePassword).not.toBe("");
      expect(copy.emailCodeSent("user@example.com")).toContain("user@example.com");
      expect(copy.sendCode).not.toBe("");
      expect(copy.sendingCode).not.toBe("");
      expect(copy.verifyCode).not.toBe("");
      expect(copy.confirmEmail).not.toBe("");
      expect(copy.confirmingEmail).not.toBe("");
      expect(copy.changeEmail).not.toBe("");
      expect(copy.resendCode).not.toBe("");
      expect(copy.resendIn(3)).toContain("3");
      expect(copy.legal.acknowledgement).not.toBe("");
      expect(copy.legal.terms).not.toBe("");
      expect(copy.legal.privacy).not.toBe("");
      for (const message of Object.values(copy.errors)) expect(message).not.toBe("");
    }
    expect(getAuthCopy("en-US").title).toMatch(/musuw/i);
    expect(getAuthCopy("zh-CN").title).toContain("Musuw");
  });
});

describe("auth shell legal acknowledgement", () => {
  it("places the legal acknowledgement below enabled authentication actions", () => {
    const html = renderToStaticMarkup(
      createElement(AuthApp, { runtime: {} as AuthRuntime }),
    );

    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain(`href="${authLegalHref("terms", "en-US")}"`);
    expect(html).toContain(`href="${authLegalHref("privacy", "en-US")}"`);
    expect(html).toContain("auth-legal-note");
    expect(html).not.toMatch(/class="auth-google" disabled/);
    expect(html).not.toMatch(/<button disabled="" type="submit">Send code/);
    expect(html).toContain('name="password"');
    expect(html).toContain("Forgot password?");
    expect(html).toContain("Create account");
  });

  it("uses the canonical public legal documents", () => {
    expect(AUTH_LEGAL_LINKS).toEqual({
      privacy: "https://musuw.com/privacy",
      terms: "https://musuw.com/terms",
    });
    expect(authLegalHref("terms", "zh-CN")).toBe("https://musuw.com/terms?lang=zh-CN");
    expect(authLegalHref("privacy", "en-US")).toBe("https://musuw.com/privacy?lang=en");
  });
});

describe("auth shell TikHub reference experience", () => {
  it("renders the Musuw split narrative as three independent headline segments", () => {
    const html = renderToStaticMarkup(
      createElement(AuthApp, { runtime: {} as AuthRuntime }),
    );
    const source = readFileSync(new URL("./AuthApp.tsx", import.meta.url), "utf8");

    expect(html).toContain('class="auth-layout"');
    expect(html).toContain('class="auth-showcase"');
    expect(html).toContain('class="auth-showcase-pre"');
    expect(html).toContain('class="auth-true-focus-word"');
    expect(getAuthCopy("zh-CN").heroLines).toEqual([
      "把资料转化为",
      "会",
      "思考的",
      "知识资产",
    ]);
    expect(source).toContain("创建你的AI第二大脑");
    expect(source).toContain("把资料转化为");
    expect(source).toContain('"会", "思考的", "知识资产"');
    expect(source).toContain("知识资产");
  });

  it("keeps password primary and places Google plus email code after the divider", () => {
    const html = renderToStaticMarkup(
      createElement(AuthApp, { runtime: {} as AuthRuntime }),
    );
    const submitIndex = html.indexOf('type="submit"');
    const dividerIndex = html.indexOf('class="auth-divider"');
    const googleIndex = html.indexOf('class="auth-provider auth-google"');
    const emailCodeIndex = html.indexOf('class="auth-provider auth-email-code"');

    expect(submitIndex).toBeGreaterThan(-1);
    expect(dividerIndex).toBeGreaterThan(submitIndex);
    expect(googleIndex).toBeGreaterThan(dividerIndex);
    expect(emailCodeIndex).toBeGreaterThan(dividerIndex);
    expect(html.match(/auth-google/g)).toHaveLength(1);
  });

  it("uses one shared shell without importing another identity runtime or support widget", () => {
    const source = readFileSync(new URL("./AuthApp.tsx", import.meta.url), "utf8");
    const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    expect(source.match(/<main className="auth-page"/g)).toHaveLength(1);
    expect(source).not.toContain("@supabase");
    expect(source).not.toContain("tikhub");
    expect(source).not.toMatch(/intercom|customer.?service|support.?widget/i);
    expect(index).not.toMatch(/chaport|intercom|customer.?service|support.?widget/i);
  });

  it("keeps recovery success inside the same shell with retry and back actions", () => {
    const source = readFileSync(new URL("./AuthApp.tsx", import.meta.url), "utf8");

    expect(source).toContain('className="auth-message auth-message--success"');
    expect(source).toContain('className="auth-result-primary"');
    expect(source).toContain('className="auth-link auth-back-link"');
    expect(source).toContain('{!isRecoveryExperience ? (');
    expect(source).toContain('src="/auth/auth-reference/google.svg"');
    expect(source).toContain('src="/auth/musuw-logo.png"');
  });

  it("uses the reference font, equal split, high-contrast liquid motion, and responsive collapse", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const showcase = readFileSync(new URL("./AuthShowcase.tsx", import.meta.url), "utf8");

    expect(css).toContain('@font-face');
    expect(css).toContain('font-family: "Geist"');
    expect(css).toMatch(/\.auth-layout\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.auth-showcase\s*\{[\s\S]*background:\s*#080808/);
    expect(css).not.toContain("filter: grayscale(1)");
    expect(showcase).toContain('["#E5E5E5", "#737373", "#262626"]');
    expect(showcase).toContain("cursorSize={120}");
    expect(showcase).toContain("mouseForce={32}");
    expect(css).toMatch(/@media\s*\(max-width:\s*1023px\)[\s\S]*\.auth-showcase\s*\{[\s\S]*display:\s*none/);
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*\.auth-logo\s*\{[\s\S]*filter:\s*invert\(1\)/);
    expect(css).not.toContain("#1a73e8");
  });
});

describe("auth shell email privacy", () => {
  it("masks the destination shown while entering a code", () => {
    expect(maskAuthEmail("person@example.com")).toBe("pe••••@example.com");
    expect(maskAuthEmail("a@example.com")).toBe("a••@example.com");
    expect(maskAuthEmail("invalid")).toBe("••••");
  });
});

describe("auth shell password-field composition", () => {
  it("keeps the reveal control out of the full-width primary-button selector", () => {
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

    expect(css).toContain(
      ".auth-form button:not(.auth-link):not(.auth-password-toggle)",
    );
    expect(css).not.toMatch(
      /\.auth-form button:not\(\.auth-link\)(?!:not\(\.auth-password-toggle\))/,
    );
    expect(css).toMatch(/\.auth-password-toggle\s*\{[\s\S]*position:\s*absolute;/);
  });

  it("renders signup confirmation as an accessible six-digit code form", () => {
    const source = readFileSync(new URL("./AuthApp.tsx", import.meta.url), "utf8");

    expect(source).toContain('key="registration-confirmation"');
    expect(source).toContain("runtime.verifySignupOtp");
    expect(source).toContain('autoComplete="one-time-code"');
    expect(source).toContain('inputMode="numeric"');
    expect(source).toContain('pattern="[0-9]{6}"');
    expect(source).toContain("copy.confirmEmail");
    expect(source).toContain("copy.confirmingEmail");
    expect(source).toContain("isSubmitting || verificationCode.length !== 6");
  });
});
