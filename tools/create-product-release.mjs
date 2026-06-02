#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildProductReleaseNotes,
  findProductReleasePull,
  parseProductReleaseVersion,
} from './lib/productRelease.mjs';

const repository = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_SHA;

if (!repository || !sha) {
  throw new Error('GITHUB_REPOSITORY and GITHUB_SHA are required.');
}

const pulls = JSON.parse(
  execFileSync(
    'gh',
    [
      'api',
      `/repos/${repository}/commits/${sha}/pulls`,
      '-H',
      'Accept: application/vnd.github+json',
      '-H',
      'X-GitHub-Api-Version: 2022-11-28',
    ],
    { encoding: 'utf8' }
  )
);

const pull = findProductReleasePull(pulls);
if (!pull) {
  console.log('No associated product release PR found; skipping product release record.');
  process.exit(0);
}

const version = parseProductReleaseVersion(pull.body ?? '');
const tag = `t3x-v${version}`;

try {
  execFileSync('gh', ['release', 'view', tag], { encoding: 'utf8', stdio: 'pipe' });
  console.log(`Product release ${tag} already exists; skipping.`);
  process.exit(0);
} catch {
  // gh returns non-zero when the release does not exist.
}

const notesPath = join(mkdtempSync(join(tmpdir(), 't3x-product-release-')), 'notes.md');
writeFileSync(notesPath, buildProductReleaseNotes({ pull, version }));

execFileSync(
  'gh',
  [
    'release',
    'create',
    tag,
    '--target',
    sha,
    '--title',
    `T3X v${version}`,
    '--notes-file',
    notesPath,
  ],
  { stdio: 'inherit' }
);

console.log(`Created product release ${tag}.`);
