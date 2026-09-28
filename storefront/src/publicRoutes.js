export const HOME_PAGES = Object.freeze([
  Object.freeze({ locale: "zh-CN", path: "/" }),
  Object.freeze({ locale: "en", path: "/en" }),
]);

export function homePath(locale) {
  return locale === "zh-CN" || locale === "zh" ? "/" : "/en";
}

export function homeLocale(pathname) {
  const path = pathname?.replace(/\/+$/, "") || "/";
  return HOME_PAGES.find((page) => page.path === path)?.locale ?? null;
}

export function homepageHref(href, locale) {
  return href === "/" || href.startsWith("/#") ? `${homePath(locale)}${href.slice(1)}` : href;
}

export function localeHref(pathname, locale, { search = "", hash = "", alternatePath } = {}) {
  const query = new URLSearchParams(search);
  const path = alternatePath ?? (homeLocale(pathname) ? homePath(locale) : pathname);
  if (alternatePath || homeLocale(pathname)) query.delete("lang");
  else query.set("lang", locale);
  return `${path}${query.size ? `?${query}` : ""}${hash}`;
}
