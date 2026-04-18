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

  assert.match(dockerCompose, /t3x-api:[\s\S]*AUTH_DISABLED=\$\{AUTH_DISABLED:-false\}/);
  assert.match(dockerCompose, /t3x-webui:[\s\S]*AUTH_DISABLED=\$\{AUTH_DISABLED:-false\}/);
  assert.match(dockerCompose, /auth-on by default/i);
});
