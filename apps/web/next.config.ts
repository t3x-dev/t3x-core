import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Output standalone for Docker deployment
  output: 'standalone',
  // Transpile workspace packages
  transpilePackages: ['@t3x/core', '@t3x/storage'],
  // Externalize packages with binary/WASM files that bundler cannot handle
  // - @electric-sql/pglite: has postgres.data WASM file
  // - postgres: has binary data files (for Docker/production)
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  // Next.js 16: Enable Turbopack (default bundler)
  turbopack: {},
};

export default nextConfig;
