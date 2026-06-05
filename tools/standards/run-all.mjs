#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { renderStandardsSummary, runStandards } from '../lib/standardsRunner.mjs';

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== '--');
  const options = {
    mode: 'full',
    changedPathsFile: null,
    requestedRows: [],
    json: false,
    summaryFile: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--mode') {
      options.mode = requireValue(args, index);
      index += 1;
    } else if (arg === '--changed-paths') {
      options.changedPathsFile = requireValue(args, index);
      index += 1;
    } else if (arg === '--rows') {
      options.requestedRows = requireValue(args, index)
        .split(',')
        .map((rowId) => rowId.trim())
        .filter(Boolean);
      index += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--summary-file') {
      options.summaryFile = requireValue(args, index);
      index += 1;
    } else {
      throw new Error(`unknown standards runner argument: ${arg}`);
    }
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runStandards(options);
  const markdown = renderStandardsSummary(result);

  if (options.summaryFile) {
    writeFileSync(options.summaryFile, markdown);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(markdown);
  }

  process.exitCode = result.exitCode;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
