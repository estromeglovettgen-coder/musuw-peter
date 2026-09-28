import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import AuthShowcase, { type AuthShowcaseState } from "./AuthShowcase";
import {
  type AuthRuntime,
  type AuthStartView,
  type AuthorizationContinuationView,
  type EmailOtpSendView,
  type IdentityCompletionView,
  type PasswordResetRequestView,
} from "./runtime";
import { getInitialAuthLocale, type AuthLocale } from "./locale";

export type InitialAuthScreen =
  | "callback_pending"
  | "consent_pending"
  | "login"
  | "logout_pending"
  | "recovery_pending"
  | "start_pending";

type Screen =
  | InitialAuthScreen
  | "email_entry"
  | "email_code"
  | "identity_pending"
  | "password_recovery"
  | "password_reset_request"
  | "password_reset_requested"
  | "register"
  | "registration_confirmation";

export const CHECKOUT_INTENT_STORAGE_KEY = "musuw.checkout.intent";

export const AUTH_LEGAL_LINKS = Object.freeze({
  privacy: "https://musuw.com/privacy",
  terms: "https://musuw.com/terms",
});

const EMAIL_CODE_COOLDOWN_SECONDS = 60;

export function authLegalHref(
  document: keyof typeof AUTH_LEGAL_LINKS,
  locale: AuthLocale,
): string {
  return `${AUTH_LEGAL_LINKS[document]}?lang=${locale === "zh-CN" ? "zh-CN" : "en"}`;
}

export function maskAuthEmail(value: string): string {
  const separator = value.indexOf("@");
  if (separator <= 0 || separator === value.length - 1) return "••••";
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

export type CheckoutIntent = Readonly<{
  period: "monthly" | "yearly";
  plan: "plus" | "pro" | "max";
}>;

export function checkoutIntentFromSearch(search: string): CheckoutIntent | null {
  const parameters = new URLSearchParams(search);
  const plan = parameters.get("plan");
  const period = parameters.get("period");
  if (
    (plan !== "plus" && plan !== "pro" && plan !== "max") ||
    (period !== "monthly" && period !== "yearly")
  ) {
    return null;
  }
  return { period, plan };
}

export function checkoutWorkspacePathFromSearch(search: string): string {
  const intent = checkoutIntentFromSearch(search);
  if (intent === null) return "/";
  const parameters = new URLSearchParams({ plan: intent.plan, period: intent.period });
  return `/?${parameters.toString()}`;
}

export type AuthCopy = Readonly<{
  heroEyebrow: string;
  heroLines: readonly [string, string, string, string];
  heroDescription: string;
  recoveryHeroEyebrow: string;
  recoveryHeroLines: readonly [string, string];
  recoveryHeroDescription: string;
  title: string;
  intro: string;
  registerTitle: string;
  registerIntro: string;
  google: string;
  divider: string;
  status: string;
  email: string;
  emailPlaceholder: string;
  password: string;
  passwordPlaceholder: string;
  confirmPassword: string;
  confirmPasswordPlaceholder: string;
  signIn: string;
  signingIn: string;
  signInUnavailable: string;
  createAccount: string;
  creatingAccount: string;
  signUpUnavailable: string;
  updatePassword: string;
  updatingPassword: string;
  forgotPassword: string;
  forgotPasswordTitle: string;
  forgotPasswordIntro: string;
  successTitle: string;
  tryAgain: string;
  sendResetLink: string;
  resetLinkSent: (email: string) => string;
  registrationConfirmation: (email: string) => string;
  passwordRecoveryTitle: string;
  passwordRecoveryIntro: string;
  passwordUpdated: string;
  useEmailCode: string;
  needAccount: string;
  alreadyHaveAccount: string;
  backToSignIn: string;
  showPassword: string;
  hidePassword: string;
  emailCodeSent: (email: string) => string;
  sendCode: string;
  sendingCode: string;
  verifyCode: string;
  confirmEmail: string;
  confirmingEmail: string;
  changeEmail: string;
  resendCode: string;
  resendIn: (seconds: number) => string;
  legal: Readonly<{
    acknowledgement: string;
    connector: string;
    privacy: string;
    terms: string;
  }>;
  errors: Readonly<{
    unavailable: string;
    oauthNotAllowed: string;
    authorization: string;
    invalidCode: string;
    incomplete: string;
    invalidEmail: string;
    emailSend: string;
    google: string;
    invalidCredentials: string;
    emailNotConfirmed: string;
    passwordWeak: string;
    passwordMismatch: string;
    passwordTooShort: string;
    resetUnavailable: string;
    rateLimited: string;
  }>;
}>;

const AUTH_COPY: Readonly<Record<AuthLocale, AuthCopy>> = {
  "zh-CN": {
    heroEyebrow: "创建你的AI第二大脑",
    heroLines: ["把资料转化为", "会", "思考的", "知识资产"],
    heroDescription: "让零散的文档、网页与数据彼此连接，沉淀成可检索、可追溯、持续进化的个人知识系统。",
    recoveryHeroEyebrow: "账户安全",
    recoveryHeroLines: ["重置密码，", "恢复安全访问"],
    recoveryHeroDescription: "输入您的邮箱和新密码，我们将发送验证链接到您的邮箱以确认更改。",
    title: "登录 Musuw",
    intro: "使用 Google、邮箱密码或验证码继续。",
    registerTitle: "创建 Musuw 账号",
    registerIntro: "使用邮箱和密码创建你的账号。",
    google: "Google 登录",
    divider: "或继续使用",
    status: "正在继续登录…",
    email: "邮箱",
    emailPlaceholder: "name@example.com",
    password: "密码",
    passwordPlaceholder: "输入密码",
    confirmPassword: "确认密码",
    confirmPasswordPlaceholder: "再次输入密码",
    signIn: "登录",
    signingIn: "登录中…",
    signInUnavailable: "登录暂不可用，请稍后重试。",
    createAccount: "创建账号",
    creatingAccount: "创建中…",
    signUpUnavailable: "暂时无法创建账号，请稍后重试。",
    updatePassword: "更新密码",
    updatingPassword: "更新中…",
    forgotPassword: "忘记密码？",
    forgotPasswordTitle: "重置密码",
    forgotPasswordIntro: "输入邮箱，我们会发送重置密码的链接。",
    successTitle: "成功",
    tryAgain: "重试",
    sendResetLink: "发送重置链接",
    resetLinkSent: (email) => `如果 ${email} 已注册，你会收到重置密码的邮件。`,
    registrationConfirmation: (email) => `请检查 ${email} 的收件箱，输入六位验证码或打开确认链接后即可登录。`,
    passwordRecoveryTitle: "设置新密码",
    passwordRecoveryIntro: "设置一个新的密码以完成恢复。",
    passwordUpdated: "密码已更新，请继续登录。",
    useEmailCode: "邮箱验证码登录",
    needAccount: "还没有账号？",
    alreadyHaveAccount: "已有账号？",
    backToSignIn: "返回登录",
    showPassword: "显示密码",
    hidePassword: "隐藏密码",
    emailCodeSent: (email) => `已向 ${email} 发送六位验证码`,
    sendCode: "发送验证码",
    sendingCode: "发送中…",
    verifyCode: "验证并继续",
    confirmEmail: "确认邮箱",
    confirmingEmail: "确认中…",
    changeEmail: "更换邮箱",
    resendCode: "重新发送验证码",
    resendIn: (seconds) => `${seconds} 秒后可重新发送`,
    legal: {
      acknowledgement: "继续即表示你同意",
      terms: "《服务条款》",
      connector: "，并确认已阅读",
      privacy: "《隐私政策》",
    },
    errors: {
      unavailable: "登录暂不可用，请重试。",
      oauthNotAllowed: "此应用未获允许，无法继续授权。",
      authorization: "无法继续授权，请重新开始。",
      invalidCode: "验证码无效，请重新输入。",
      incomplete: "登录未完成，请重试。",
      invalidEmail: "请输入有效的邮箱地址。",
      emailSend: "暂时无法发送验证码，请稍后重试。",
      google: "暂时无法使用 Google 登录，请重试。",
      invalidCredentials: "邮箱或密码不正确。",
      emailNotConfirmed: "请先确认邮箱，再使用密码登录。",
      passwordWeak: "这个密码不够安全，请换一个更强的密码。",
      passwordMismatch: "两次输入的密码不一致。",
      passwordTooShort: "密码至少需要 8 个字符。",
      resetUnavailable: "暂时无法处理密码重置，请稍后重试。",
      rateLimited: "请求过于频繁，请稍后再试。",
    },
  },
  "en-US": {
    heroEyebrow: "Create your AI second brain",
    heroLines: ["Turn information", "into", "knowledge", "that thinks"],
    heroDescription: "Connect documents, webpages, and data in a searchable, traceable knowledge system that keeps growing with you.",
    recoveryHeroEyebrow: "Account security",
    recoveryHeroLines: ["Reset your password,", "restore secure access"],
    recoveryHeroDescription: "Update your password through a protected email flow and return safely to your knowledge workspace.",
    title: "Log in to Musuw",
    intro: "Continue with Google, an email and password, or a code.",
    registerTitle: "Create your Musuw account",
    registerIntro: "Use your email and a password to get started.",
    google: "Google",
    divider: "or continue with",
    status: "Continuing sign-in…",
    email: "Email",
    emailPlaceholder: "name@example.com",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    confirmPassword: "Confirm password",
    confirmPasswordPlaceholder: "Enter your password again",
    signIn: "Sign in",
    signingIn: "Signing in…",
    signInUnavailable: "Sign-in is temporarily unavailable. Please try again later.",
    createAccount: "Create account",
    creatingAccount: "Creating account…",
    signUpUnavailable: "Account creation is temporarily unavailable. Please try again later.",
    updatePassword: "Update password",
    updatingPassword: "Updating password…",
    forgotPassword: "Forgot password?",
    forgotPasswordTitle: "Reset your password",
    forgotPasswordIntro: "Enter your email and we’ll send a password reset link.",
    successTitle: "Success",
    tryAgain: "Try again",
    sendResetLink: "Send reset link",
    resetLinkSent: (email) => `If ${email} is registered, you’ll receive a password reset email.`,
    registrationConfirmation: (email) => `Check ${email} for a six-digit code or confirmation link before signing in.`,
    passwordRecoveryTitle: "Set a new password",
    passwordRecoveryIntro: "Choose a new password to finish recovering your account.",
    passwordUpdated: "Your password was updated. You can sign in now.",
    useEmailCode: "Email verification code",
    needAccount: "Need an account?",
    alreadyHaveAccount: "Already have an account?",
    backToSignIn: "Back to sign in",
    showPassword: "Show password",
    hidePassword: "Hide password",
    emailCodeSent: (email) => `We sent a six-digit code to ${email}`,
    sendCode: "Send code",
    sendingCode: "Sending…",
    verifyCode: "Verify and continue",
    confirmEmail: "Confirm email",
    confirmingEmail: "Confirming…",
    changeEmail: "Use a different email",
    resendCode: "Resend code",
    resendIn: (seconds) => `Resend in ${seconds}s`,
    legal: {
      acknowledgement: "By continuing, you agree to the",
      terms: "Terms of Service",
      connector: "and acknowledge the",
      privacy: "Privacy Policy",
    },
    errors: {
      unavailable: "Sign-in is temporarily unavailable. Please try again.",
      oauthNotAllowed: "This app is not allowed to continue.",
      authorization: "Unable to continue authorization. Please start again.",
      invalidCode: "Invalid code. Please try again.",
      incomplete: "Sign-in was not completed. Please try again.",
      invalidEmail: "Enter a valid email address.",
      emailSend: "We couldn't send a code right now. Please try again later.",
      google: "Google sign-in is temporarily unavailable. Please try again.",
      invalidCredentials: "Your email or password is incorrect.",
      emailNotConfirmed: "Confirm your email before signing in with a password.",
      passwordWeak: "That password is too weak. Choose a stronger one.",
      passwordMismatch: "The passwords do not match.",
      passwordTooShort: "Passwords must be at least 8 characters.",
      resetUnavailable: "Password reset is temporarily unavailable. Please try again later.",
      rateLimited: "Too many requests. Please try again later.",
    },
  },
};

export function getAuthCopy(locale: AuthLocale): AuthCopy {
  return AUTH_COPY[locale];
}

export function initialAuthScreenForPathname(pathname: string): InitialAuthScreen {
  if (pathname === "/auth/start") return "start_pending";
  if (pathname === "/auth/callback") return "callback_pending";
  if (pathname === "/auth/recovery") return "recovery_pending";
  if (pathname === "/oauth/consent") return "consent_pending";
  if (pathname === "/auth/logout") return "logout_pending";
  return "login";
}

export function initialAuthErrorForPathname(
  pathname: string,
  locale: AuthLocale = "zh-CN",
): string | null {
  return pathname === "/auth/error" ? getAuthCopy(locale).errors.unavailable : null;
}

function startFailureMessage(result: AuthStartView, copy: AuthCopy): string | null {
  return result.state === "start_error" ? copy.errors.unavailable : null;
}

function failureMessage(
  result: AuthorizationContinuationView | IdentityCompletionView | EmailOtpSendView,
  copy: AuthCopy,
  context: "generic" | "signIn" | "signUp" | "reset" = "generic",
): string | null {
  if (result.state === "identity_complete" || result.state === "authorization_complete") return null;
  if (
    result.state === "authorization_login_required" ||
    result.state === "email_otp_sent" ||
    result.state === "registration_confirmation" ||
    result.state === "password_recovery_ready"
  ) return null;
  if (result.state === "authorization_error") {
    return result.code === "oauth_client_not_allowed"
      ? copy.errors.oauthNotAllowed
      : copy.errors.authorization;
  }
  if (result.state === "identity_error") {
    switch (result.code) {
      case "email_code_invalid":
        return copy.errors.invalidCode;
      case "email_invalid":
        return copy.errors.invalidEmail;
      case "invalid_credentials":
        return context === "reset" ? copy.errors.resetUnavailable : copy.errors.invalidCredentials;
      case "email_not_confirmed":
        // Supabase may evaluate confirmation status before password validity;
        // keep this indistinguishable from a bad password at the UI boundary.
        return context === "reset" ? copy.errors.resetUnavailable : copy.errors.invalidCredentials;
      case "weak_password":
        return copy.errors.passwordWeak;
      case "password_mismatch":
        return copy.errors.passwordMismatch;
      case "password_too_short":
        return copy.errors.passwordTooShort;
      case "password_recovery_failed":
        return copy.errors.resetUnavailable;
      case "password_invalid":
        return context === "reset" ? copy.errors.resetUnavailable : copy.errors.invalidCredentials;
      case "rate_limited":
        return copy.errors.rateLimited;
      case "signup_unavailable":
        return context === "signUp" ? copy.signUpUnavailable : copy.errors.unavailable;
      case "unavailable":
        return context === "signIn"
          ? copy.signInUnavailable
          : context === "signUp"
            ? copy.signUpUnavailable
            : context === "reset"
              ? copy.errors.resetUnavailable
              : copy.errors.unavailable;
      default:
        return copy.errors.incomplete;
    }
  }
  return result.code === "email_invalid"
    ? copy.errors.invalidEmail
    : copy.errors.emailSend;
}

function passwordResetMessage(result: PasswordResetRequestView, copy: AuthCopy): string | null {
  if (result.state === "password_reset_requested") return null;
  if (result.code === "email_invalid") return copy.errors.invalidEmail;
  if (result.code === "rate_limited") return copy.errors.rateLimited;
  return copy.errors.resetUnavailable;
}

export function AuthApp({ runtime }: Readonly<{ runtime: AuthRuntime }>) {
  const [locale] = useState<AuthLocale>(() => {
    if (typeof window === "undefined") return "en-US";
    return getInitialAuthLocale();
  });
  const copy = getAuthCopy(locale);
  const [screen, setScreen] = useState<Screen>(() => {
    if (typeof window === "undefined") return "login";
    return initialAuthScreenForPathname(window.location.pathname);
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [isShowcaseFocused, setIsShowcaseFocused] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return initialAuthErrorForPathname(window.location.pathname, locale);
  });
  const handledRoute = useRef<string | null>(null);

  const applyIdentityCompletion = useCallback((result: IdentityCompletionView) => {
    if (result.state === "password_recovery_ready") {
      window.history.replaceState({}, document.title, "/auth/recovery");
      setError(null);
      setPassword("");
      setPasswordConfirmation("");
      setShowPassword(false);
      setShowPasswordConfirmation(false);
      setScreen("password_recovery");
      return;
    }
    const message = failureMessage(result, copy);
    if (message !== null) {
      setError(message);
      setScreen(
        result.state === "identity_error" && result.code === "password_recovery_failed"
          ? "password_reset_request"
          : "login",
      );
    }
  }, [copy]);

  const clearPasswordFields = useCallback(() => {
    setPassword("");
    setPasswordConfirmation("");
    setShowPassword(false);
    setShowPasswordConfirmation(false);
  }, []);

  useEffect(() => () => clearPasswordFields(), [clearPasswordFields]);

  const showLogin = useCallback(() => {
    clearPasswordFields();
    setVerificationCode("");
    setResendAvailableAt(null);
    setResendSeconds(0);
    setError(null);
    setScreen("login");
  }, [clearPasswordFields]);

  const showEmailEntry = useCallback(() => {
    if (isSubmitting) return;
    clearPasswordFields();
    setError(null);
    setScreen("email_entry");
  }, [clearPasswordFields, isSubmitting]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = copy.title;
  }, [copy.title, locale]);

  useEffect(() => {
    if (resendAvailableAt === null) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1_000));
      setResendSeconds(remaining);
      if (remaining === 0) setResendAvailableAt(null);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAt]);

  useEffect(() => {
    if (window.location.pathname !== "/auth/start") return;
    const intent = checkoutIntentFromSearch(window.location.search);
    try {
      if (intent === null) {
        window.sessionStorage.removeItem(CHECKOUT_INTENT_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(CHECKOUT_INTENT_STORAGE_KEY, JSON.stringify(intent));
      }
    } catch {
      // Checkout remains available from General Settings when storage is blocked.
    }
  }, []);

  useEffect(() => {
    const route = `${screen}:${window.location.pathname}:${window.location.search}`;
    const routeAction =
      screen === "callback_pending" ||
      screen === "consent_pending" ||
      screen === "logout_pending" ||
      screen === "recovery_pending" ||
      screen === "start_pending";
    if (routeAction && handledRoute.current === route) return;
    if (screen === "start_pending") {
      handledRoute.current = route;
      void runtime.resumeStart(checkoutWorkspacePathFromSearch(window.location.search)).then(
        (result) => {
          if (result.state === "start_login_required") {
            setScreen("login");
            return;
          }
          const message = startFailureMessage(result, copy);
          if (message !== null) {
            setError(message);
            setScreen("login");
          }
        },
        () => {
          setError(copy.errors.unavailable);
          setScreen("login");
        },
      );
      return;
    }
    if (screen === "callback_pending") {
      handledRoute.current = route;
      void runtime.completeCallback(window.location.search).then(applyIdentityCompletion, () => {
        setError(copy.errors.incomplete);
        setScreen("login");
      });
      return;
    }
    if (screen === "recovery_pending") {
      handledRoute.current = route;
      void runtime.resumePasswordRecovery().then(applyIdentityCompletion, () => {
        setError(copy.errors.resetUnavailable);
        setScreen("password_reset_request");
      });
      return;
    }
    if (screen === "consent_pending") {
      handledRoute.current = route;
      void runtime.continueAuthorization(window.location.search).then(
        (result) => {
          if (result.state === "authorization_login_required") {
            setScreen("login");
            return;
          }
          const message = failureMessage(result, copy);
          if (message !== null) {
            setError(message);
            setScreen("login");
          }
        },
        () => {
          setError(copy.errors.authorization);
          setScreen("login");
        },
      );
      return;
    }
    if (screen === "logout_pending") {
      handledRoute.current = route;
      void runtime.signOut().finally(() => window.location.replace("/auth/start"));
    }
  }, [applyIdentityCompletion, copy, runtime, screen]);

  const startGoogle = useCallback(() => {
    if ((screen !== "login" && screen !== "register") || isSubmitting) return;
    clearPasswordFields();
    setError(null);
    setIsSubmitting(true);
    setScreen("identity_pending");
    void runtime.startGoogle().catch(() => {
      setError(copy.errors.google);
      setScreen("login");
      setIsSubmitting(false);
    });
  }, [clearPasswordFields, copy.errors.google, isSubmitting, runtime, screen]);

  const signInWithPassword = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;
      setError(null);
      setIsSubmitting(true);
      setScreen("identity_pending");
      try {
        const result = await runtime.signInWithPassword(email, password);
        if (result.state === "identity_complete") {
          setScreen("identity_pending");
          return;
        }
        const message = failureMessage(result, copy, "signIn");
        setError(message ?? copy.errors.incomplete);
        setScreen("login");
      } catch {
        setError(copy.errors.invalidCredentials);
        setScreen("login");
      } finally {
        setIsSubmitting(false);
        clearPasswordFields();
      }
    },
    [clearPasswordFields, copy, email, isSubmitting, password, runtime],
  );

  const signUpWithPassword = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;
      setError(null);
      setIsSubmitting(true);
      try {
        const result = await runtime.signUpWithPassword(email, password, passwordConfirmation);
        const message = failureMessage(result, copy, "signUp");
        if (message !== null) {
          setError(message);
          return;
        }
        clearPasswordFields();
        if (result.state === "registration_confirmation") {
          setEmail(result.email);
          setVerificationCode("");
          setScreen("registration_confirmation");
        } else {
          setScreen("identity_pending");
        }
      } catch {
        setError(copy.signUpUnavailable);
      } finally {
        setIsSubmitting(false);
        clearPasswordFields();
      }
    },
    [clearPasswordFields, copy, email, isSubmitting, password, passwordConfirmation, runtime],
  );

  const requestPasswordReset = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;
      setError(null);
      setIsSubmitting(true);
      try {
        const result = await runtime.requestPasswordReset(email);
        const message = passwordResetMessage(result, copy);
        if (message !== null) {
          setError(message);
          return;
        }
        if (result.state === "password_reset_requested") {
          setEmail(result.email);
          setScreen("password_reset_requested");
        }
      } catch {
        setError(copy.errors.resetUnavailable);
      } finally {
        setIsSubmitting(false);
      }
    },
    [copy, email, isSubmitting, runtime],
  );

  const updatePassword = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;
      setError(null);
      setIsSubmitting(true);
      try {
        const result = await runtime.updatePassword(password, passwordConfirmation);
        if (result.state === "identity_complete") {
          setScreen("identity_pending");
          return;
        }
        const message = failureMessage(result, copy, "reset");
        setError(message ?? copy.errors.resetUnavailable);
      } catch {
        setError(copy.errors.resetUnavailable);
      } finally {
        setIsSubmitting(false);
        clearPasswordFields();
      }
    },
    [clearPasswordFields, copy, isSubmitting, password, passwordConfirmation, runtime],
  );

  const showRegister = useCallback(() => {
    if (isSubmitting) return;
    clearPasswordFields();
    setError(null);
    setScreen("register");
  }, [clearPasswordFields, isSubmitting]);

  const showPasswordReset = useCallback(() => {
    if (isSubmitting) return;
    clearPasswordFields();
    setError(null);
    setScreen("password_reset_request");
  }, [clearPasswordFields, isSubmitting]);

  const useEmailCode = useCallback(() => {
    if (isSubmitting) return;
    clearPasswordFields();
    setError(null);
    setScreen("email_entry");
  }, [clearPasswordFields, isSubmitting]);

  const sendEmailCode = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await runtime.requestEmailOtp(email);
      const message = failureMessage(result, copy);
      if (message !== null) {
        setError(message);
        return;
      }
      if (result.state === "email_otp_sent") {
        setEmail(result.email);
        setVerificationCode("");
        setResendAvailableAt(Date.now() + EMAIL_CODE_COOLDOWN_SECONDS * 1_000);
        setResendSeconds(EMAIL_CODE_COOLDOWN_SECONDS);
        setScreen("email_code");
      }
    } catch {
      setError(copy.errors.emailSend);
    } finally {
      setIsSubmitting(false);
    }
  }, [copy, email, isSubmitting, runtime]);

  const requestEmailCode = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await sendEmailCode();
    },
    [sendEmailCode],
  );

  const resendEmailCode = useCallback(() => {
    if (resendSeconds > 0) return;
    void sendEmailCode();
  }, [resendSeconds, sendEmailCode]);

  const verifyEmailCode = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;
      setError(null);
      setScreen("identity_pending");
      setIsSubmitting(true);
      try {
        const result = await runtime.verifyEmailOtp(email, verificationCode);
        const message = failureMessage(result, copy);
        if (message !== null) {
          setError(message);
          setScreen("email_code");
        } else {
          applyIdentityCompletion(result);
        }
      } catch {
        setError(copy.errors.incomplete);
        setScreen("email_code");
      } finally {
        setIsSubmitting(false);
      }
    },
    [applyIdentityCompletion, copy, email, isSubmitting, runtime, verificationCode],
  );

  const verifySignupCode = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;
      setError(null);
      setIsSubmitting(true);
      setScreen("identity_pending");
      try {
        const result = await runtime.verifySignupOtp(email, verificationCode);
        const message = failureMessage(result, copy);
        if (message !== null) {
          setError(message);
          setScreen("registration_confirmation");
        } else {
          applyIdentityCompletion(result);
        }
      } catch {
        setError(copy.errors.incomplete);
        setScreen("registration_confirmation");
      } finally {
        setIsSubmitting(false);
      }
    },
    [applyIdentityCompletion, copy, email, isSubmitting, runtime, verificationCode],
  );

  const isPendingScreen =
    screen === "callback_pending" ||
    screen === "consent_pending" ||
    screen === "identity_pending" ||
    screen === "logout_pending" ||
    screen === "recovery_pending" ||
    screen === "start_pending";

  const isPasswordMode = screen === "login" || screen === "register";
  const isRecoveryExperience =
    screen === "password_reset_request" ||
    screen === "password_reset_requested" ||
    screen === "password_recovery" ||
    screen === "recovery_pending";
  const passwordInputType = showPassword ? "text" : "password";
  const confirmationInputType = showPasswordConfirmation ? "text" : "password";
  const title = isPendingScreen ? copy.status :
    screen === "register" ? copy.registerTitle :
    screen === "password_reset_requested"
      ? copy.successTitle
      : screen === "password_reset_request"
      ? copy.forgotPasswordTitle
      : screen === "password_recovery"
        ? copy.passwordRecoveryTitle
        : screen === "email_entry"
          ? copy.useEmailCode
          : screen === "email_code"
            ? copy.verifyCode
            : screen === "registration_confirmation"
              ? copy.confirmEmail
        : copy.title;
  const intro = screen === "register" ? copy.registerIntro :
    screen === "password_reset_request"
      ? copy.forgotPasswordIntro
      : screen === "password_recovery"
        ? copy.passwordRecoveryIntro
        : null;
  const heroEyebrow = isRecoveryExperience ? copy.recoveryHeroEyebrow : copy.heroEyebrow;
  const heroLines = isRecoveryExperience ? copy.recoveryHeroLines : copy.heroLines;
  const heroDescription = isRecoveryExperience
    ? copy.recoveryHeroDescription
    : copy.heroDescription;
  const headlinePre = /[,，]$/.test(heroLines[0])
    ? heroLines[0]
    : `${heroLines[0]}${locale === "zh-CN" ? "，" : ","}`;
  const headlineFocus = heroLines.slice(1).join(" ");
  const showcaseState: AuthShowcaseState = error !== null
    ? "error"
    : showPassword || showPasswordConfirmation
      ? "privacy"
      : isShowcaseFocused || isPendingScreen || isSubmitting
        ? "curious"
        : "idle";

  return (
    <main className="auth-page" aria-busy={isPendingScreen || isSubmitting}>
      <div className="auth-layout">
        <AuthShowcase
          eyebrowPhrases={[heroEyebrow]}
          headlineFocus={headlineFocus}
          headlinePre={headlinePre}
          interactionState={showcaseState}
          subhead={heroDescription}
        />

        <section
          className="auth-panel"
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (!(next instanceof Node) || !event.currentTarget.contains(next)) setIsShowcaseFocused(false);
          }}
          onFocusCapture={() => setIsShowcaseFocused(true)}
        >
          <div className="auth-panel-inner">
            <header className="auth-header">
              <img alt="Musuw" className="auth-logo" height="28" src="/auth/musuw-logo.png" width="28" />
              <span>Musuw</span>
            </header>
            <section
              aria-labelledby="auth-title"
              className="auth-card"
              aria-busy={isPendingScreen || isSubmitting}
            >
              {isPendingScreen ? (
                <div className="auth-status-view" role="status">
                  <span aria-hidden="true" className="auth-spinner" />
                  <h1 id="auth-title">{title}</h1>
                </div>
              ) : (
                <>
                  <h1 id="auth-title">{title}</h1>
                  {intro !== null ? <p className="auth-intro">{intro}</p> : null}
                  {error !== null ? <p className="auth-error" id="auth-error" role="alert">{error}</p> : null}

        {screen === "email_code" ? (
          <form
            className="auth-form"
            key="email-code"
            noValidate
            onSubmit={(event) => void verifyEmailCode(event)}
          >
            <label htmlFor="email-code">{copy.emailCodeSent(maskAuthEmail(email))}</label>
            <input
              aria-describedby={error === copy.errors.invalidCode ? "auth-error" : undefined}
              aria-invalid={error === copy.errors.invalidCode}
              autoComplete="one-time-code"
              autoFocus
              id="email-code"
              onChange={(event) => {
                setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                if (error !== null) setError(null);
              }}
              inputMode="numeric"
              maxLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
              value={verificationCode}
            />
            <button disabled={isSubmitting || verificationCode.length !== 6} type="submit">
              {copy.verifyCode}
            </button>
            <div className="auth-form-actions">
              <button
                className="auth-link auth-resend"
                disabled={isSubmitting || resendSeconds > 0}
                onClick={resendEmailCode}
                type="button"
              >
                {isSubmitting
                  ? copy.sendingCode
                  : resendSeconds > 0
                    ? copy.resendIn(resendSeconds)
                    : copy.resendCode}
              </button>
              <button className="auth-link" disabled={isSubmitting} onClick={showEmailEntry} type="button">
                {copy.changeEmail}
              </button>
            </div>
          </form>
        ) : screen === "login" ? (
          <form className="auth-form" key="password-login" noValidate onSubmit={(event) => void signInWithPassword(event)}>
            <div className="auth-field-group">
              <label htmlFor="email">{copy.email}</label>
              <input
                aria-describedby={error === copy.errors.invalidEmail ? "auth-error" : undefined}
                aria-invalid={error === copy.errors.invalidEmail}
                autoComplete="username"
                id="email"
                name="email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (error !== null) setError(null);
                }}
                placeholder={copy.emailPlaceholder}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="auth-field-group">
              <div className="auth-field-label-row">
                <label htmlFor="password">{copy.password}</label>
                <button className="auth-link auth-forgot" disabled={isSubmitting} onClick={showPasswordReset} type="button">
                  {copy.forgotPassword}
                </button>
              </div>
              <div className="auth-password-field">
                <input
                  aria-describedby={error !== null ? "auth-error" : undefined}
                  aria-invalid={error !== null}
                  autoComplete="current-password"
                  id="password"
                  name="password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error !== null) setError(null);
                  }}
                  placeholder={copy.passwordPlaceholder}
                  required
                  type={passwordInputType}
                  value={password}
                />
                <button
                  aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? copy.hidePassword : copy.showPassword}
                </button>
              </div>
            </div>
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? copy.signingIn : copy.signIn}
            </button>
            <div className="auth-form-actions auth-mode-switch">
              <span>{copy.needAccount}</span>
              <button className="auth-link" disabled={isSubmitting} onClick={showRegister} type="button">
                {copy.createAccount}
              </button>
            </div>
          </form>
        ) : screen === "register" ? (
          <form className="auth-form" key="password-register" noValidate onSubmit={(event) => void signUpWithPassword(event)}>
            <label htmlFor="email">{copy.email}</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => {
                setEmail(event.target.value);
                if (error !== null) setError(null);
              }}
              placeholder={copy.emailPlaceholder}
              required
              type="email"
              value={email}
            />
            <label htmlFor="password">{copy.password}</label>
            <div className="auth-password-field">
              <input
                aria-describedby={
                  error === copy.errors.passwordTooShort || error === copy.errors.passwordMismatch
                    ? "auth-error"
                    : undefined
                }
                aria-invalid={error === copy.errors.passwordTooShort || error === copy.errors.passwordMismatch}
                autoComplete="new-password"
                id="password"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error !== null) setError(null);
                }}
                placeholder={copy.passwordPlaceholder}
                required
                type={passwordInputType}
                value={password}
              />
              <button
                aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                className="auth-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? copy.hidePassword : copy.showPassword}
              </button>
            </div>
            <label htmlFor="password-confirmation">{copy.confirmPassword}</label>
            <div className="auth-password-field">
              <input
                aria-describedby={error === copy.errors.passwordMismatch ? "auth-error" : undefined}
                aria-invalid={error === copy.errors.passwordMismatch}
                autoComplete="new-password"
                id="password-confirmation"
                name="passwordConfirmation"
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value);
                  if (error !== null) setError(null);
                }}
                placeholder={copy.confirmPasswordPlaceholder}
                required
                type={confirmationInputType}
                value={passwordConfirmation}
              />
              <button
                aria-label={showPasswordConfirmation ? copy.hidePassword : copy.showPassword}
                className="auth-password-toggle"
                onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                type="button"
              >
                {showPasswordConfirmation ? copy.hidePassword : copy.showPassword}
              </button>
            </div>
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? copy.creatingAccount : copy.createAccount}
            </button>
            <div className="auth-form-actions auth-mode-switch">
              <span>{copy.alreadyHaveAccount}</span>
              <button className="auth-link" disabled={isSubmitting} onClick={showLogin} type="button">
                {copy.backToSignIn}
              </button>
            </div>
          </form>
        ) : screen === "password_reset_request" ? (
          <form className="auth-form" key="password-reset-request" noValidate onSubmit={(event) => void requestPasswordReset(event)}>
            <label htmlFor="email">{copy.email}</label>
            <input
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => {
                setEmail(event.target.value);
                if (error !== null) setError(null);
              }}
              placeholder={copy.emailPlaceholder}
              required
              type="email"
              value={email}
            />
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? copy.sendingCode : copy.sendResetLink}
            </button>
            <button className="auth-link auth-back-link" disabled={isSubmitting} onClick={showLogin} type="button">
              ← {copy.backToSignIn}
            </button>
          </form>
        ) : screen === "password_recovery" ? (
          <form className="auth-form" key="password-recovery" noValidate onSubmit={(event) => void updatePassword(event)}>
            <label htmlFor="password">{copy.password}</label>
            <div className="auth-password-field">
              <input
                aria-describedby={
                  error === copy.errors.passwordTooShort || error === copy.errors.passwordMismatch
                    ? "auth-error"
                    : undefined
                }
                aria-invalid={error === copy.errors.passwordTooShort || error === copy.errors.passwordMismatch}
                autoComplete="new-password"
                id="password"
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error !== null) setError(null);
                }}
                placeholder={copy.passwordPlaceholder}
                required
                type={passwordInputType}
                value={password}
              />
              <button
                aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                className="auth-password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? copy.hidePassword : copy.showPassword}
              </button>
            </div>
            <label htmlFor="password-confirmation">{copy.confirmPassword}</label>
            <div className="auth-password-field">
              <input
                aria-describedby={error === copy.errors.passwordMismatch ? "auth-error" : undefined}
                aria-invalid={error === copy.errors.passwordMismatch}
                autoComplete="new-password"
                id="password-confirmation"
                name="passwordConfirmation"
                onChange={(event) => {
                  setPasswordConfirmation(event.target.value);
                  if (error !== null) setError(null);
                }}
                placeholder={copy.confirmPasswordPlaceholder}
                required
                type={confirmationInputType}
                value={passwordConfirmation}
              />
              <button
                aria-label={showPasswordConfirmation ? copy.hidePassword : copy.showPassword}
                className="auth-password-toggle"
                onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                type="button"
              >
                {showPasswordConfirmation ? copy.hidePassword : copy.showPassword}
              </button>
            </div>
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? copy.updatingPassword : copy.updatePassword}
            </button>
            <button className="auth-link auth-back-link" disabled={isSubmitting} onClick={showLogin} type="button">
              ← {copy.backToSignIn}
            </button>
          </form>
        ) : screen === "registration_confirmation" ? (
          <form
            className="auth-form"
            key="registration-confirmation"
            noValidate
            onSubmit={(event) => void verifySignupCode(event)}
          >
            <label htmlFor="registration-confirmation-code">
              {copy.registrationConfirmation(maskAuthEmail(email))}
            </label>
            <input
              aria-describedby={error !== null ? "auth-error" : undefined}
              aria-invalid={error !== null}
              autoComplete="one-time-code"
              autoFocus
              disabled={isSubmitting}
              id="registration-confirmation-code"
              inputMode="numeric"
              maxLength={6}
              name="confirmationCode"
              onChange={(event) => {
                setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                if (error !== null) setError(null);
              }}
              pattern="[0-9]{6}"
              required
              value={verificationCode}
            />
            <button disabled={isSubmitting || verificationCode.length !== 6} type="submit">
              {isSubmitting ? copy.confirmingEmail : copy.confirmEmail}
            </button>
            <button className="auth-link" disabled={isSubmitting} onClick={showLogin} type="button">
              {copy.backToSignIn}
            </button>
          </form>
        ) : screen === "password_reset_requested" ? (
          <div className="auth-message auth-message--success" role="status">
            <span aria-hidden="true" className="auth-result-icon">✓</span>
            <p>{copy.resetLinkSent(maskAuthEmail(email))}</p>
            <button className="auth-result-primary" onClick={showPasswordReset} type="button">
              {copy.tryAgain}
            </button>
            <button className="auth-link auth-back-link" onClick={showLogin} type="button">
              ← {copy.backToSignIn}
            </button>
          </div>
        ) : (
          <form className="auth-form" key="email-address" noValidate onSubmit={(event) => void requestEmailCode(event)}>
            <label htmlFor="email">{copy.email}</label>
            <input
              aria-describedby={error === copy.errors.invalidEmail ? "auth-error" : undefined}
              aria-invalid={error === copy.errors.invalidEmail}
              autoComplete="email"
              id="email"
              name="email"
              onChange={(event) => {
                setEmail(event.target.value);
                if (error !== null) setError(null);
              }}
              placeholder={copy.emailPlaceholder}
              required
              type="email"
              value={email}
            />
            <button disabled={isSubmitting} type="submit">
              {isSubmitting ? copy.sendingCode : copy.sendCode}
            </button>
            <button className="auth-link" disabled={isSubmitting} onClick={showLogin} type="button">
              {copy.backToSignIn}
            </button>
          </form>
        )}

        {isPasswordMode ? (
          <>
            <div className="auth-divider" role="separator">
              <span>{copy.divider}</span>
            </div>
            <div className="auth-provider-options">
              <button
                className="auth-provider auth-google"
                disabled={isSubmitting}
                onClick={startGoogle}
                type="button"
              >
                <img alt="" aria-hidden="true" src="/auth/auth-reference/google.svg" />
                <span>{copy.google}</span>
              </button>
              <button
                className="auth-provider auth-email-code"
                disabled={isSubmitting}
                onClick={useEmailCode}
                type="button"
              >
                <img alt="" aria-hidden="true" src="/auth/auth-reference/mail.svg" />
                <span>{copy.useEmailCode}</span>
              </button>
            </div>
          </>
        ) : null}

        {!isRecoveryExperience ? (
          <p className="auth-legal-note">
            {copy.legal.acknowledgement}{" "}
            <a href={authLegalHref("terms", locale)} rel="noopener noreferrer" target="_blank">
              {copy.legal.terms}
            </a>{" "}
            {copy.legal.connector}{" "}
            <a href={authLegalHref("privacy", locale)} rel="noopener noreferrer" target="_blank">
              {copy.legal.privacy}
            </a>
          </p>
        ) : null}
                </>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
