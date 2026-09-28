import { normalizeCountry } from "../src/pricingLocalization.js";
import { localizeDocumentResponse, selectLocale } from "./localization.js";
import { prerenderAssetPath } from "./prerender.js";
import { customerServiceResponse } from "./customerService.js";
import { homeLocale } from "../src/publicRoutes.js";

function requestCountry(request) {
  return normalizeCountry(request.cf?.country || request.headers.get("CF-IPCountry"));
}

function notFound() {
  return Response.json(
    { error: "NOT_FOUND" },
    { status: 404, headers: { "cache-control": "private, no-store" } },
  );
}

const partnerFiles = new Set(["/", "/app.js", "/data.js", "/style.css", "/musuw-logo.png"]);

async function partnerBoardResponse(request, env, url) {
  if (!partnerFiles.has(url.pathname)) return notFound();
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  }
  const assetUrl = new URL(url);
  assetUrl.pathname = `/partner-board${url.pathname}`;
  assetUrl.search = "";
  // Public static assets do not need the parent-domain session or API headers.
  const response = await env.ASSETS.fetch(new Request(assetUrl, { method: request.method }));
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-content-type-options", "nosniff");
  headers.delete("set-cookie");
  if (url.pathname === "/" && response.ok) {
    const locale = url.searchParams.get("lang") === "en" ? "en" : "zh-CN";
    headers.set("content-language", locale);
    headers.set("cache-control", "no-store");
    headers.delete("etag");
    headers.delete("content-length");
    if (request.method === "GET") {
      let html = await response.text();
      html = html.replace('<html lang="zh-CN">', `<html lang="${locale}">`);
      if (locale === "en") html = html.replace("Musuw 推广榜单", "Musuw Partner Leaderboard");
      return new Response(html, { status: response.status, headers });
    }
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.hostname === "partners.musuw.com") return partnerBoardResponse(request, env, url);
  const customerService = await customerServiceResponse(request, env, url);
  if (customerService) return customerService;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return notFound(); }
  if (pathname === "/partner-board" || pathname.startsWith("/partner-board/")) return notFound();
  if (pathname === "/_prerender" || pathname.startsWith("/_prerender/")) return notFound();
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return notFound();
  }
  if (request.method === "GET" || request.method === "HEAD") {
    let redirect = false;
    if (url.hostname === "www.musuw.com") {
      url.hostname = "musuw.com";
      redirect = true;
    }
    if (pathname === "/zh" || pathname === "/zh/") {
      url.pathname = "/";
      url.searchParams.delete("lang");
      redirect = true;
    } else if (pathname === "/" && url.searchParams.has("lang")) {
      url.pathname = url.searchParams.get("lang") === "en" ? "/en" : "/";
      url.searchParams.delete("lang");
      redirect = true;
    } else if (pathname === "/en" || pathname === "/en/") {
      redirect ||= pathname !== "/en" || url.searchParams.has("lang");
      url.pathname = "/en";
      url.searchParams.delete("lang");
    }
    if (pathname === "/guides/check-ai-answer-sources" || pathname === "/guides/check-ai-answer-sources/") {
      url.pathname = "/guides/citation-checks";
      redirect = true;
    }
    if (redirect) return Response.redirect(url.toString(), 301);
  }

  const country = requestCountry(request);
  const locale = homeLocale(url.pathname) ?? selectLocale(country, request.headers.get("cookie") ?? "", url.searchParams.get("lang") ?? "");
  const isDocumentRequest = request.method === "GET" || request.method === "HEAD";
  const prerenderPath = isDocumentRequest ? prerenderAssetPath(url.pathname, locale, country) : null;
  let assetRequest = request;
  if (prerenderPath) {
    const assetUrl = new URL(url);
    assetUrl.pathname = prerenderPath;
    assetUrl.search = "";
    assetRequest = new Request(assetUrl, { method: "GET" });
  }
  const assetResponse = await env.ASSETS.fetch(assetRequest);
  const contentType = assetResponse.headers.get("content-type") ?? "";
  if (isDocumentRequest && contentType.toLowerCase().includes("text/html")) {
    const response = await localizeDocumentResponse(
      assetResponse,
      locale,
      url.pathname,
      url.hostname,
      country,
    );
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
  if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
    const headers = new Headers(assetResponse.headers);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    return new Response(assetResponse.body, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  }
  return assetResponse;
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
