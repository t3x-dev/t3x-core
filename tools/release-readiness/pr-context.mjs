#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolveReleaseReadinessPrContext } from '../lib/releaseReadinessPrContext.mjs';

function parseArgs(argv) {
  const options = {
    prJson: null,
    repository: null,
    githubOutput: process.env.GITHUB_OUTPUT || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--pr-json') {
      options.prJson = requireValue(argv, index);
      index += 1;
    } else if (arg === '--repository') {
      options.repository = requireValue(argv, index);
      index += 1;
    } else if (arg === '--github-output') {
      options.githubOutput = requireValue(argv, index);
      index += 1;
    } else {
      throw new Error(`unknown readiness PR context argument: ${arg}`);
    }
  }

  if (!options.prJson) {
    throw new Error('--pr-json is required');
  }
  if (!options.repository) {
    throw new Error('--repository is required');
  }
  if (!options.githubOutput) {
    throw new Error('GITHUB_OUTPUT or --github-output is required');
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
  const pullRequest = JSON.parse(readFileSync(options.prJson, 'utf8'));
  const context = resolveReleaseReadinessPrContext({
    repository: options.repository,
    pullRequest,
  });

  writeGithubOutputs(options.githubOutput, context);
}

function writeGithubOutputs(path, context) {
  const lines = [];
  for (const [key, value] of Object.entries(context)) {
    if (key === 'pr_body') {
      const delimiter = `T3X_PR_BODY_${Date.now()}`;
      lines.push(`${key}<<${delimiter}`);
      lines.push(value ?? '');
      lines.push(delimiter);
    } else {
      lines.push(`${key}=${value ?? ''}`);
    }
  }
  appendFileSync(path, `${lines.join('\n')}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
