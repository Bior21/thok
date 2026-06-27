/** @type {import('next').NextConfig} */

const nextConfig = {
  // ── Output ────────────────────────────────────────────────────────────────
  // Static export for Vercel deployment. The app is a fully static PWA —
  // no server-side rendering needed since all data fetching is client-side.
  output: 'export',

  // ── Images ────────────────────────────────────────────────────────────────
  // Required when using output: 'export' — Next.js image optimisation needs
  // a server, so we disable it and use standard <img> tags instead.
  images: {
    unoptimized: true,
  },

  // ── Trailing slash ────────────────────────────────────────────────────────
  // Ensures /home resolves to /home/index.html in static export.
  trailingSlash: true,

  // ── TypeScript ────────────────────────────────────────────────────────────
  typescript: {
    // Fail the build on type errors — never deploy broken types.
    ignoreBuildErrors: false,
  },

  // ── ESLint ────────────────────────────────────────────────────────────────
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
