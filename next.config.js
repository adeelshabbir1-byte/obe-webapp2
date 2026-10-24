/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Loaded from node_modules at runtime instead of being bundled — the PDF
    // libraries read their own files/workers and break when webpack inlines them.
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
    // The Regulations Library's starter documents are read from disk by the API route that loads them.
    outputFileTracingIncludes: { "/api/regulations": ["./regulations-seed/**/*"] },
    // Import only the icons actually used instead of the whole barrel.
    optimizePackageImports: ["lucide-react"],
    // Keep visited pages in the browser for 30 s, so going back or switching between recent pages is instant.
    // Saving anything calls router.refresh(), which fetches fresh data straight away.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [
      {
        // Brand assets are re-generated under a new file name if they ever change.
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=2592000" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // SAMEORIGIN (not DENY): the report print bundle embeds our own report pages in iframes.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
