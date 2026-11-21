import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // three / R3F ship ESM that Next can bundle directly; transpile for safety on older mobile browsers.
  transpilePackages: ["three"],
  poweredByHeader: false,
};

export default nextConfig;
