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

test('README documents the first-run auth split accurately', () => {
  const readme = readText('README.md');

  assert.match(
    readme,
    /Docker and self-hosted runs keep auth on by default, so the first WebUI visit goes through the built-in username\/password login at `\/login`\./
  );
  assert.match(
    readme,
    /When `AUTH_DISABLED` is unset, `pnpm dev:api` and `pnpm dev:webui` default to source-dev mode and open straight into the app on `localhost`\./
  );
  assert.match(
    readme,
    /- Source development \(`pnpm dev:api`, `pnpm dev:webui`\) opens directly into the app by default\./
  );
  assert.match(
    readme,
    /- Docker and self-host keep auth on by default and use the built-in username\/password login\./
  );
});

test('.env.example documents provider keys and source-dev auth overrides', () => {
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
    /Set AUTH_DISABLED=false here or in your shell if you want to exercise the login/
  );
  assert.match(
    envExample,
    /Docker and other self-hosted deployments keep auth on by default through/
  );
  assert.match(envExample, /^AUTH_DISABLED=$/m);
});
