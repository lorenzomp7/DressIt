import type { NextConfig } from "next";

// Exported as a fully static site, published on GitHub Pages (.github/workflows/pages.yml).
// On Pages the app lives under /DressIt: the workflow sets NEXT_PUBLIC_BASE_PATH=/DressIt.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
