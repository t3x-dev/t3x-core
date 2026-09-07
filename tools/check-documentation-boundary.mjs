import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Inspect the index so staged additions cannot evade the boundary with .gitignore.
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const internal =
  /^(?:docs\/(?:plans|verification|history)\/|notes\/|(?:.*\/)?(?:test-results|playwright-report|blob-report)\/|design-qa\.md$|MIGRATION_PLAN\.md$|docs\/cloud-features-progress\.md$)/;
const errors = files
  .filter((file) => internal.test(file))
  .map((file) => `Internal artifact is tracked: ${file}`);
const exclusions = new Set(
  readFileSync('.dockerignore', 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
);
for (const pattern of [
  'docs',
  '**/docs',
  'notes',
  '**/*.md',
  '**/test-results',
  '**/playwright-report',
  '**/blob-report',
  '**/e2e',
  '**/__tests__',
  '**/*.test.*',
  '**/*.spec.*',
]) {
  if (!exclusions.has(pattern)) errors.push(`Missing Docker exclusion: ${pattern}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Documentation and build-context boundaries passed.');
}
