/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@medgrowth/ai", "@medgrowth/config", "@medgrowth/db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
};

module.exports = nextConfig;
