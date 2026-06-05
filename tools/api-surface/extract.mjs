#!/usr/bin/env node
import { updateApiSnapshots, verifyApiSnapshots } from '../lib/apiSurface.mjs';

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== '--');
  const options = {
    write: false,
    verify: false,
    build: true,
    packageNames: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') {
      options.write = true;
    } else if (arg === '--verify') {
      options.verify = true;
    } else if (arg === '--skip-build' || arg === '--local' || arg === '-r') {
      if (arg === '--skip-build') {
        options.build = false;
      }
    } else if (arg === '--package') {
      options.packageNames.push(requireValue(args, index));
      index += 1;
    } else {
      throw new Error(`unknown API extraction argument: ${arg}`);
    }
  }

  if (!options.write && !options.verify) {
    options.verify = true;
  }

  if (options.write && options.verify) {
    throw new Error('choose either --write or --verify');
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

  if (options.write) {
    const result = updateApiSnapshots({
      build: options.build,
      packageNames: options.packageNames,
    });
    for (const entry of result.updated) {
      process.stdout.write(`updated ${entry.snapshotRelativePath}\n`);
    }
    return;
  }

  const result = verifyApiSnapshots({
    build: options.build,
    packageNames: options.packageNames,
  });
  if (result.ok) {
    process.stdout.write(
      `api snapshots current: ${result.checked.map((entry) => entry.name).join(', ')}\n`
    );
    return;
  }

  for (const entry of result.configErrors) {
    process.stderr.write(
      `missing API extractor config for ${entry.name}: ${entry.configRelativePath}\n`
    );
  }
  for (const entry of result.staleSnapshots) {
    process.stderr.write(`stale API snapshot for ${entry.name}: ${entry.snapshotRelativePath}\n`);
  }
  process.stderr.write('Run `pnpm api-extract -r --local` to update committed snapshots.\n');
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
