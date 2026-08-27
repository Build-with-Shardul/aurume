import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdfkit external so it reads its bundled AFM fonts from node_modules
  // instead of being bundled (which breaks font resolution).
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
