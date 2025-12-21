import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Output standalone for Docker deployment
  output: 'standalone',
  // Transpile workspace packages
  transpilePackages: ['@t3x/core', '@t3x/storage'],
};

export default nextConfig;
