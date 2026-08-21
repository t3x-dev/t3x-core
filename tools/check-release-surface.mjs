#!/usr/bin/env node
import { validateReleaseSurface } from './lib/releaseSurface.mjs';
import {
  pausedReleaseTrainChangesetDiagnostics,
  pausedReleaseTrainIgnoreDiagnostics,
  readChangesetConfig,
  readChangesets,
} from './release-train/ensure-changesets.mjs';

const result = validateReleaseSurface();
const changesetConfig = readChangesetConfig();
const changesetIgnoreDiagnostics = pausedReleaseTrainIgnoreDiagnostics({
  changesetConfig,
  releaseSurface: result,
});
const changesetDiagnostics = pausedReleaseTrainChangesetDiagnostics({
  changesets: readChangesets(),
  releaseSurface: result,
});

for (const warning of result.warnings) {
  console.warn(`warning: ${warning}`);
}

const errors = [...result.errors, ...changesetIgnoreDiagnostics, ...changesetDiagnostics];

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log(`release surface ok: ${result.npmPublishPackages.join(', ')}`);
