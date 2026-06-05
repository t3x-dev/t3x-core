#!/usr/bin/env node
import { validateYopsStability } from '../lib/yopsStability.mjs';

const result = validateYopsStability();

if (result.errors.length > 0) {
  process.stdout.write(
    `${JSON.stringify({
      row_id: 'row-3',
      status: 'fail',
      summary: 'YOps stability validation failed.',
      details: result.errors,
    })}\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      row_id: 'row-3',
      status: 'pass',
      summary: `YOps stability metadata is complete for ${result.operationCount} operations.`,
      details: [],
    })}\n`
  );
}
