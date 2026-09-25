/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Import only the icons/modules actually used instead of whole barrels.
    optimizePackageImports: ["lucide-react"],
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
        ],
      },
    ];
  },
};
module.exports = nextConfig;
