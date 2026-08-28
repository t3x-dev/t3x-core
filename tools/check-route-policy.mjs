#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routesDir = path.join(repoRoot, 'packages/api/src/routes');
const inventoryPath = path.join(repoRoot, 'packages/api/route-policy.json');
const allowedPolicies = new Set([
  'authenticated',
  'local-only',
  'operator',
  'project',
  'public',
  'runner-service',
]);
const approvedPublicRoutes = new Set([
  'app.ts::GET /docs',
  'app.ts::GET /openapi.json',
  'auth-local.openapi.ts::POST /v1/auth/login',
  'auth-local.openapi.ts::POST /v1/auth/register',
  'health.openapi.ts::GET /health',
  'llm.openapi.ts::GET /v1/llm/models',
  'namespaces.openapi.ts::GET /v1/namespaces/{slug}',
  'share.openapi.ts::GET /v1/share/{token}',
  'ws.ts::GET /ws',
]);

function discoverRoutes() {
  const discovered = [];
  const routePattern =
    /\b(?:const|let)\s+(\w+)\s*=\s*createRoute\(\{\s*method:\s*'([^']+)',\s*path:\s*'([^']+)'/g;
  const spreadRoutePattern =
    /\b(?:const|let)\s+(\w+)\s*=\s*createRoute\(\{\s*\.\.\.(\w+),\s*path:\s*'([^']+)'/g;
  const rawRoutePattern = /\b\w+\.(get|post|put|patch|delete)\(\s*['"](\/[^'"]+)['"]/g;

  for (const source of fs
    .readdirSync(routesDir)
    .filter((name) => name.endsWith('.openapi.ts') || name === 'ws.ts')
    .sort()) {
    const code = fs.readFileSync(path.join(routesDir, source), 'utf8');
    const declarationCount = code.match(/createRoute\(\{/g)?.length ?? 0;
    let parsedDeclarationCount = 0;
    const methodsByRouteVariable = new Map();
    let match;
    while ((match = routePattern.exec(code)) !== null) {
      const method = match[2].toUpperCase();
      methodsByRouteVariable.set(match[1], method);
      discovered.push({ source, method, path: match[3] });
      parsedDeclarationCount += 1;
    }
    while ((match = spreadRoutePattern.exec(code)) !== null) {
      const inheritedMethod = methodsByRouteVariable.get(match[2]);
      if (!inheritedMethod) {
        throw new Error(`${source}: cannot resolve method inherited from ${match[2]}`);
      }
      methodsByRouteVariable.set(match[1], inheritedMethod);
      discovered.push({ source, method: inheritedMethod, path: match[3] });
      parsedDeclarationCount += 1;
    }
    if (parsedDeclarationCount !== declarationCount) {
      throw new Error(
        `${source}: parsed ${parsedDeclarationCount} of ${declarationCount} createRoute declarations`
      );
    }
    while ((match = rawRoutePattern.exec(code)) !== null) {
      discovered.push({ source, method: match[1].toUpperCase(), path: match[2] });
    }
  }

  discovered.push(
    { source: 'app.ts', method: 'GET', path: '/docs' },
    { source: 'app.ts', method: 'GET', path: '/openapi.json' }
  );

  return discovered;
}

function keyOf(route) {
  return `${route.source}::${route.method} ${route.path}`;
}

const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
if (inventory.version !== 1 || !Array.isArray(inventory.routes)) {
  throw new Error('route-policy.json must contain version 1 and a routes array');
}

const errors = [];
const inventoryByKey = new Map();
for (const route of inventory.routes) {
  const key = keyOf(route);
  if (inventoryByKey.has(key)) errors.push(`duplicate inventory entry: ${key}`);
  if (!allowedPolicies.has(route.policy)) {
    errors.push(`invalid policy '${route.policy}' for ${key}`);
  }
  if (typeof route.rationale !== 'string' || route.rationale.trim().length === 0) {
    errors.push(`missing rationale for ${key}`);
  }
  if (route.policy === 'public' && !approvedPublicRoutes.has(key)) {
    errors.push(`unapproved public route classification: ${key}`);
  }
  inventoryByKey.set(key, route);
}

const discovered = discoverRoutes();
const discoveredKeys = new Set(discovered.map(keyOf));
if (discoveredKeys.size !== discovered.length) {
  const counts = new Map();
  for (const route of discovered) counts.set(keyOf(route), (counts.get(keyOf(route)) ?? 0) + 1);
  for (const [key, count] of counts) {
    if (count > 1) errors.push(`duplicate route declaration (${count}): ${key}`);
  }
}
for (const route of discovered) {
  const key = keyOf(route);
  if (!inventoryByKey.has(key)) errors.push(`unclassified API route: ${key}`);
}
for (const key of inventoryByKey.keys()) {
  if (!discoveredKeys.has(key)) errors.push(`stale route-policy entry: ${key}`);
}
for (const key of approvedPublicRoutes) {
  if (inventoryByKey.get(key)?.policy !== 'public') {
    errors.push(`approved public route is missing or not public: ${key}`);
  }
}

if (errors.length > 0) {
  console.error('Route policy inventory failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Route policy inventory verified (${discovered.length} routes).`);
