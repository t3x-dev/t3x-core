import fs from 'node:fs';
import type { NextConfig } from 'next';
import path from 'node:path';

// Load .env from monorepo root so NEXT_PUBLIC_* vars are available in local dev
const rootEnvPath = path.resolve(__dirname, '../../.env');
if (fs.existsSync(rootEnvPath)) {
  for (const line of fs.readFileSync(rootEnvPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

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
