import type { NextConfig } from "next";

// Exported as a fully static site (served by Render's CDN, never sleeps).
// Security headers live in render.yaml, since a static export cannot set them.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
