import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg'],
};

export default nextConfig;
