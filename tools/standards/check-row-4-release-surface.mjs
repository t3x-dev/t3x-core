#!/usr/bin/env node
import { validateReleaseSurface } from '../lib/releaseSurface.mjs';

const result = validateReleaseSurface();

if (result.errors.length > 0) {
  process.stdout.write(
    `${JSON.stringify({
      row_id: 'row-4',
      status: 'fail',
      summary: 'Release surface validation failed.',
      details: result.errors,
    })}\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      row_id: 'row-4',
      status: 'pass',
      summary: `Release surface is consistent for ${result.npmPublishPackages.join(', ')}.`,
      details: result.warnings,
    })}\n`
  );
}
