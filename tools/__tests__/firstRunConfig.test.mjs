import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applySourceDevAuthDefault } from '../lib/sourceDevAuthDefaults.mjs';

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

test('README documents the first-run auth split accurately', () => {
  const readme = readText('README.md');

  assert.match(readme, /## Quickstart/);
  assert.match(readme, /Run the full stack locally/);
  assert.match(readme, /Develop from source/);
  assert.match(readme, /Docker and self-hosted runs keep auth on by default/);
  assert.match(readme, /source-dev mode and open straight into the app on `localhost`/);
  assert.match(
    readme,
    /set `AUTH_DISABLED=false` in the shell where you start both dev processes/i
  );
  assert.match(readme, /- Docker and self-host keep auth on by default/);
});

test('source-dev auth defaults only apply when the shell has not already set AUTH_DISABLED', () => {
  assert.equal(applySourceDevAuthDefault({ PATH: '/usr/bin' }).AUTH_DISABLED, 'true');
  assert.equal(
    applySourceDevAuthDefault({ PATH: '/usr/bin', AUTH_DISABLED: 'false' }).AUTH_DISABLED,
    'false'
  );
});

test('.env.example documents provider keys and shell-based source-dev auth overrides', () => {
  const envExample = readText('.env.example');

  assert.match(envExample, /^ANTHROPIC_API_KEY=$/m);
  assert.match(envExample, /^OPENAI_API_KEY=$/m);
  assert.match(envExample, /^GOOGLE_AI_STUDIO_KEY=$/m);
  assert.match(
    envExample,
    /Source development \(`pnpm dev:api`, `pnpm dev:webui`\) defaults AUTH_DISABLED=true/
  );
  assert.match(
    envExample,
    /export[\s\S]*AUTH_DISABLED=false in the same shell before starting both dev processes/i
  );
  assert.match(
    envExample,
    /The source-dev launcher sets the default before the apps read `\.env`\./
  );
  assert.match(
    envExample,
    /Docker and other self-hosted deployments keep auth on by default through/
  );
  assert.match(envExample, /^AUTH_DISABLED=$/m);
});
