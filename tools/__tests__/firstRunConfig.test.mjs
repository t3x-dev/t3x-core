import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../..', import.meta.url);

function readText(relativePath) {
  return readFileSync(new URL(relativePath, root), 'utf8');
}

test('package.json dev scripts route through the source launcher', () => {
  const packageJson = JSON.parse(readText('package.json'));

  assert.equal(packageJson.scripts['dev:api'], 'node tools/dev-source-runner.mjs api');
  assert.equal(packageJson.scripts['dev:webui'], 'node tools/dev-source-runner.mjs webui');
});

test('docker-compose.yml defaults auth on for docker and self-hosted deployments', () => {
  const dockerCompose = readText('docker-compose.yml');
  const apiSection = dockerCompose.match(/  t3x-api:\n([\s\S]*?)\n  # ============================================\n  # T3X WebUI/m)?.[1];
  const webuiSection = dockerCompose.match(/  t3x-webui:\n([\s\S]*?)\n  # ============================================\n  # T3X Runner/m)?.[1];

  assert.ok(apiSection, 'expected to find the t3x-api service section');
  assert.ok(webuiSection, 'expected to find the t3x-webui service section');
  assert.match(apiSection, /^\s*- AUTH_DISABLED=\$\{AUTH_DISABLED:-false\}$/m);
  assert.match(webuiSection, /^\s*- AUTH_DISABLED=\$\{AUTH_DISABLED:-false\}$/m);
  assert.match(dockerCompose, /auth-on by default/i);
});
