/** @type {import('next').NextConfig} */
const nextConfig = {
  // Loaded from node_modules at runtime instead of being bundled — the PDF
  // libraries read their own files/workers and break when webpack inlines them.
  experimental: { serverComponentsExternalPackages: ["pdf-parse", "pdfjs-dist"] },
};
module.exports = nextConfig;
