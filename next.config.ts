import type { NextConfig } from "next";

const nextConfig = {
  async headers() {
    const protectedHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Vary", value: "Cookie" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
    ];
    return [
      { headers: protectedHeaders, source: "/login" },
      { headers: protectedHeaders, source: "/library/:path*" },
    ];
  },
  poweredByHeader: false,
  reactStrictMode: true,
} satisfies NextConfig;

export default nextConfig;
