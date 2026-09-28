export const THEME_STORAGE_KEY = "musuw-theme";

export function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  const bootstrappedTheme = document.documentElement.dataset.theme;
  if (bootstrappedTheme === "dark" || bootstrappedTheme === "light") {
    return bootstrappedTheme;
  }
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
  } catch {
    // Storage can be blocked; the system preference remains a stable fallback.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The visible theme still applies when persistence is unavailable.
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute("content", theme === "dark" ? "#0c0c10" : "#ffffff");
}
