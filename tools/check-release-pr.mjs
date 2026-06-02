#!/usr/bin/env node
import { readChangesetFiles, validateReleasePr } from './lib/releasePr.mjs';

const result = validateReleasePr({
  baseBranch: process.env.T3X_PR_BASE ?? '',
  headBranch: process.env.T3X_PR_HEAD ?? '',
  body: process.env.T3X_PR_BODY ?? '',
  changesetFiles: readChangesetFiles(),
});

if (result.errors.length > 0) {
  for (const error of result.errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log('release PR policy ok');
