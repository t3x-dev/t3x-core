#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TRUSTED_COMMENT_AUTHORS = new Set(['github-actions[bot]', 'github-actions']);

function parseArgs(argv) {
  const options = {
    comments: null,
    marker: null,
    body: null,
    repository: null,
    issueNumber: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--comments') {
      options.comments = requireValue(argv, index);
      index += 1;
    } else if (arg === '--marker') {
      options.marker = requireValue(argv, index);
      index += 1;
    } else if (arg === '--body') {
      options.body = requireValue(argv, index);
      index += 1;
    } else if (arg === '--repository') {
      options.repository = requireValue(argv, index);
      index += 1;
    } else if (arg === '--issue-number') {
      options.issueNumber = Number(requireValue(argv, index));
      index += 1;
    } else {
      throw new Error(`unknown upsert comment argument: ${arg}`);
    }
  }

  for (const key of ['comments', 'marker', 'body', 'repository', 'issueNumber']) {
    if (!options[key]) {
      throw new Error(`--${kebabCase(key)} is required`);
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
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN or GH_TOKEN is required to upsert a GitHub comment');
  }

  const comments = JSON.parse(readFileSync(options.comments, 'utf8'));
  const body = readFileSync(options.body, 'utf8');
  const existing = comments.find(
    (comment) =>
      TRUSTED_COMMENT_AUTHORS.has(comment?.user?.login) &&
      typeof comment?.body === 'string' &&
      comment.body.includes(options.marker)
  );

  const response = await fetch(commentUrl(options, existing), {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    throw new Error(`GitHub comment upsert failed: ${response.status} ${await response.text()}`);
  }
}

function commentUrl(options, existing) {
  if (existing?.id) {
    return `https://api.github.com/repos/${options.repository}/issues/comments/${existing.id}`;
  }
  return `https://api.github.com/repos/${options.repository}/issues/${options.issueNumber}/comments`;
}

function kebabCase(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
