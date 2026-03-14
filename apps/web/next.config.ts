import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

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

// Configure global fetch proxy for server-side requests (e.g., NextAuth Google OAuth).
// Required in environments where google.com is not directly accessible.
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  console.log(`[proxy] Global fetch proxy configured: ${proxyUrl}`);
}

const nextConfig: NextConfig = {
  // Output standalone for Docker deployment
  output: 'standalone',
  // Transpile workspace packages
  transpilePackages: ['@t3x-dev/core', '@t3x-dev/storage'],
  // Externalize packages with binary/WASM files that bundler cannot handle
  // - postgres: has binary data files (for Docker/production)
  serverExternalPackages: ['postgres'],
  // Next.js 16: Enable Turbopack (default bundler)
  turbopack: {},
  // Hide the dev indicator floating ball (N button) in development
  devIndicators: false,
};

export default nextConfig;
