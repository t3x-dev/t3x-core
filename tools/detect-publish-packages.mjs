#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { validateReleaseSurfaceOrThrow } from './lib/releaseSurface.mjs';

function parseArgs(argv) {
  const options = {
    base: 'HEAD^',
    changedFiles: null,
    head: 'HEAD',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unexpected argument: ${arg}`);
  }

  return options;
}

function readChangedFiles(options) {
  if (options.changedFiles !== null) {
    return options.changedFiles
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean);
  }

  const output = execFileSync('git', ['diff', '--name-only', options.base, options.head], {
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

export function detectPublishPackages({ changedFiles, releaseSurface }) {
  const changedFileSet = new Set(changedFiles);
  const activeEntries = releaseSurface.packages.filter(
    (entry) => entry.npm_publish === true && entry.release_train === 'active'
  );
  const packages = activeEntries
    .filter((entry) => changedFileSet.has(`${entry.path}/package.json`))
    .map((entry) => entry.name);

  return {
    hasPublishPackages: packages.length > 0,
    packageNames: packages,
    packageSlugs: packages.map((name) => name.replace(/^@t3x-dev\//, '')),
    publishesLocal: packages.includes('@t3x-dev/local'),
  };
}

function outputLine(name, value) {
  return `${name}=${value}\n`;
}

function writeOutputs(result) {
  const lines = [
    outputLine('has_publish_packages', String(result.hasPublishPackages)),
    outputLine('package_names', result.packageNames.join(',')),
    outputLine('package_slugs', result.packageSlugs.join(',')),
    outputLine('publishes_local', String(result.publishesLocal)),
  ];

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, lines.join(''));
  }

  for (const line of lines) {
    process.stdout.write(line);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const releaseSurface = validateReleaseSurfaceOrThrow({ rootDir: new URL('..', import.meta.url) });
  const changedFiles = readChangedFiles(options);
  const result = detectPublishPackages({ changedFiles, releaseSurface });
  writeOutputs(result);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
