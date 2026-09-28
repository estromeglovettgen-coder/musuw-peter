export const APP_URL = "https://app.musuw.com/";
export const APP_LOGIN_URL = "https://app.musuw.com/auth/start";

const plans = new Set(["plus", "pro", "max"]);
const billingPeriods = new Set(["monthly", "yearly"]);

export function createProductLoginUrl(intent) {
  if (intent === undefined) return APP_LOGIN_URL;
  if (
    intent === null ||
    typeof intent !== "object" ||
    Array.isArray(intent) ||
    Object.keys(intent).length !== 2 ||
    !plans.has(intent.plan) ||
    !billingPeriods.has(intent.billingPeriod)
  ) {
    throw new Error("Unsupported checkout intent");
  }

  const url = new URL(APP_LOGIN_URL);
  url.searchParams.set("plan", intent.plan);
  url.searchParams.set("period", intent.billingPeriod);
  return url.toString();
}
