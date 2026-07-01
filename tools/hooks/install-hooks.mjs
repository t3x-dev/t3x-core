import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import path from 'node:path';

// Installs repo git hooks into .git/hooks.
// Runs automatically via `pnpm install` (see root package.json `prepare`).
// Safe to re-run; idempotent.

if (process.env.CI) {
  process.exit(0);
}

if (!existsSync('.git')) {
  process.exit(0);
}

let hooksDir;
try {
  hooksDir = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  hooksDir = path.join('.git', 'hooks');
}

mkdirSync(hooksDir, { recursive: true });

const hookSrc = path.join('tools', 'hooks', 'pre-push.sh');
const hookDst = path.join(hooksDir, 'pre-push');

if (!existsSync(hookSrc)) {
  console.log(`[install-hooks] ${hookSrc} not found; skipping`);
  process.exit(0);
}

writeFileSync(hookDst, '#!/usr/bin/env sh\nexec sh tools/hooks/pre-push.sh "$@"\n');

try {
  await chmod(hookDst, 0o755);
} catch {
  // chmod can be unavailable on some Windows filesystems; Git for Windows can
  // still run the hook by extensionless path when the content has a shebang.
}

console.log(`[install-hooks] pre-push hook installed at ${hookDst}`);
