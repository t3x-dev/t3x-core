#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  applyReadinessSignoff,
  extractTrustedSignoffState,
  parseReadinessCommand,
  readAuthorizedOwnersFromCodeowners,
  renderSignoffStateComment,
} from '../lib/releaseReadinessSignoff.mjs';

function parseArgs(argv) {
  const options = {
    commentBodyFile: null,
    commentAuthor: null,
    comments: null,
    codeowners: '.github/CODEOWNERS',
    out: 'release-readiness-signoff.md',
    decidedAt: new Date().toISOString(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--comment-body-file') {
      options.commentBodyFile = requireValue(argv, index);
      index += 1;
    } else if (arg === '--comment-author') {
      options.commentAuthor = requireValue(argv, index);
      index += 1;
    } else if (arg === '--comments') {
      options.comments = requireValue(argv, index);
      index += 1;
    } else if (arg === '--codeowners') {
      options.codeowners = requireValue(argv, index);
      index += 1;
    } else if (arg === '--out') {
      options.out = requireValue(argv, index);
      index += 1;
    } else if (arg === '--decided-at') {
      options.decidedAt = requireValue(argv, index);
      index += 1;
    } else {
      throw new Error(`unknown readiness signoff argument: ${arg}`);
    }
  }

  if (!options.commentBodyFile) {
    throw new Error('--comment-body-file is required');
  }
  if (!options.commentAuthor) {
    throw new Error('--comment-author is required');
  }
  if (!options.comments) {
    throw new Error('--comments is required');
  }

  return options;
}

function requireValue(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${argv[index]} requires a value`);
  }
  return value;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = parseReadinessCommand(readFileSync(options.commentBodyFile, 'utf8'));
  const comments = JSON.parse(readFileSync(options.comments, 'utf8'));
  const state = extractTrustedSignoffState(comments);
  const owners = readAuthorizedOwnersFromCodeowners(readFileSync(options.codeowners, 'utf8'));
  const nextState = applyReadinessSignoff({
    state,
    command,
    author: options.commentAuthor,
    owners,
    decidedAt: options.decidedAt,
  });

  writeFileSync(options.out, renderSignoffStateComment(nextState));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
