#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  buildReleaseReadinessReport,
  loadTesterEvidence,
  renderReleaseReadinessMarkdown,
  validateReleaseReadinessReport,
} from '../lib/releaseReadiness.mjs';
import {
  extractSignoffStateFromBody,
  extractTrustedSignoffState,
} from '../lib/releaseReadinessSignoff.mjs';
import { validateReleaseSurface } from '../lib/releaseSurface.mjs';

function parseArgs(argv) {
  const options = {
    standards: null,
    comments: null,
    testerEvidenceDir: 'release/readiness/tester-evidence',
    outJson: 'release-readiness.json',
    outMarkdown: 'release-readiness.md',
    prNumber: null,
    baseRef: null,
    headRef: null,
    productVersion: null,
    prJson: null,
    signoffStateComment: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--standards') {
      options.standards = requireValue(argv, index);
      index += 1;
    } else if (arg === '--comments') {
      options.comments = requireValue(argv, index);
      index += 1;
    } else if (arg === '--tester-evidence-dir') {
      options.testerEvidenceDir = requireValue(argv, index);
      index += 1;
    } else if (arg === '--out-json') {
      options.outJson = requireValue(argv, index);
      index += 1;
    } else if (arg === '--out-markdown') {
      options.outMarkdown = requireValue(argv, index);
      index += 1;
    } else if (arg === '--pr-number') {
      options.prNumber = Number(requireValue(argv, index));
      index += 1;
    } else if (arg === '--base-ref') {
      options.baseRef = requireValue(argv, index);
      index += 1;
    } else if (arg === '--head-ref') {
      options.headRef = requireValue(argv, index);
      index += 1;
    } else if (arg === '--product-version') {
      options.productVersion = requireValue(argv, index);
      index += 1;
    } else if (arg === '--pr-json') {
      options.prJson = requireValue(argv, index);
      index += 1;
    } else if (arg === '--signoff-state-comment') {
      options.signoffStateComment = requireValue(argv, index);
      index += 1;
    } else {
      throw new Error(`unknown release readiness argument: ${arg}`);
    }
  }

  if (!options.standards) {
    throw new Error('--standards requires a standards JSON file');
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
  const prMetadata = options.prJson ? readPullRequestMetadata(options.prJson) : {};
  const comments = options.comments ? readJsonFile(options.comments) : [];
  const standardsRun = readJsonFile(options.standards);
  const releaseSurface = validateReleaseSurface();
  const testerEvidence = loadTesterEvidence({
    relativeDir: options.testerEvidenceDir,
  });
  const signoffState = options.signoffStateComment
    ? extractSignoffStateFromBody(readFileSync(options.signoffStateComment, 'utf8'))
    : extractTrustedSignoffState(comments);

  const report = buildReleaseReadinessReport({
    release: {
      pr_number: options.prNumber ?? prMetadata.pr_number ?? null,
      base_ref: options.baseRef ?? prMetadata.base_ref ?? null,
      head_ref: options.headRef ?? prMetadata.head_ref ?? null,
      product_version: options.productVersion ?? prMetadata.product_version ?? null,
    },
    standardsRun,
    releaseSurface,
    testerEvidence,
    signoffState,
  });
  const validation = validateReleaseReadinessReport(report);
  if (validation.errors.length > 0) {
    throw new Error(validation.errors.join('\n'));
  }

  writeFileSync(options.outJson, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(options.outMarkdown, renderReleaseReadinessMarkdown(report));
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readPullRequestMetadata(path) {
  const payload = readJsonFile(path);
  const pullRequest = payload.pull_request ?? payload;
  const headRef = pullRequest.head?.ref ?? null;
  return {
    pr_number: pullRequest.number ?? null,
    base_ref: pullRequest.base?.ref ?? null,
    head_ref: headRef,
    product_version: headRef?.match(/^release\/v?(.+)$/)?.[1] ?? null,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
