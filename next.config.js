/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Error monitoring (lib/monitoring.ts): one SENTRY_DSN switches it on for the server and the browser; the release is
  // the commit id. Nothing is loaded when it is not set.
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN || "",
    NEXT_PUBLIC_SENTRY_TRACES: process.env.SENTRY_TRACES_SAMPLE_RATE || "0.1",
    NEXT_PUBLIC_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA || "",
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || "",
  },
  compress: true,
  experimental: {
    // instrumentation.ts starts server-side error monitoring when SENTRY_DSN is set.
    instrumentationHook: true,
    // Loaded from node_modules at runtime instead of being bundled — the PDF
    // libraries read their own files/workers and break when webpack inlines them.
    serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"],
    // The Regulations Library's starter documents are read from disk by the API route that loads them.
    outputFileTracingIncludes: { "/api/regulations": ["./regulations-seed/**/*"], "/admin/system-health/restore-guide": ["./docs/restore.md"] },
    // Import only the icons actually used instead of the whole barrel.
    optimizePackageImports: ["lucide-react"],
    // Keep visited pages in the browser for 30 s, so going back or switching between recent pages is instant.
    // Saving anything calls router.refresh(), which fetches fresh data straight away.
    staleTimes: { dynamic: 30, static: 180 },
  },
  // Level-first names (National / University / Consortium / Shared / My): the new addresses show the same pages, and
  // every old address keeps working as before.
  async rewrites() {
    return [
      { source: "/national-curricula", destination: "/curricula?show=national" },
      { source: "/university-curricula", destination: "/curricula?show=university" },
      { source: "/national-releases", destination: "/national-bank" },
      { source: "/national-regulations", destination: "/regulations" },
      { source: "/national-regulations/:id", destination: "/regulations/:id" },
      { source: "/shared-courses", destination: "/public-library" },
      { source: "/consortium-courses", destination: "/catalog" },
      { source: "/consortium-courses/:id", destination: "/catalog/:id" },
      { source: "/admin/national-subject-experts", destination: "/admin/master-experts" },
    ];
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
