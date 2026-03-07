import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'better-sqlite3'],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
