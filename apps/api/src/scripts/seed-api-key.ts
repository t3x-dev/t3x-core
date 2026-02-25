#!/usr/bin/env tsx
/**
 * Seed API Key Script
 *
 * Creates a bootstrap API key for local development.
 * Run: pnpm seed:api-key
 *
 * The full key value is printed to stdout — copy and store it.
 */

import { randomBytes } from 'node:crypto';
import { API_KEY_VALUE_PREFIX } from '@t3x/core';
import { createApiKey } from '@t3x/storage/pglite';
import { getDB } from '../lib/db';

async function main() {
  const name = process.argv[2] || 'dev-bootstrap';

  console.log('Creating API key...');

  const db = await getDB();
  const rawKey = `${API_KEY_VALUE_PREFIX}${randomBytes(24).toString('base64url')}`;

  const apiKey = await createApiKey(db, {
    name,
    keyValue: rawKey,
  });

  console.log('');
  console.log('API key created successfully!');
  console.log('─────────────────────────────────────────');
  console.log(`  ID:     ${apiKey.id}`);
  console.log(`  Name:   ${apiKey.name}`);
  console.log(`  Key:    ${rawKey}`);
  console.log('─────────────────────────────────────────');
  console.log('');
  console.log('Store this key securely — it will not be shown again.');
  console.log('Use it with: Authorization: Bearer <key>');
  console.log('');
  console.log('Or set AUTH_DISABLED=true in .env for local development.');

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create API key:', err);
  process.exit(1);
});
