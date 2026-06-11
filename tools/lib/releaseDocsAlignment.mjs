import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyVersions } from '../verify-versions.mjs';
import { validateReleaseSurface } from './releaseSurface.mjs';

function toRootUrl(rootDir) {
  if (rootDir instanceof URL) {
    return rootDir;
  }

  return pathToFileURL(`${path.resolve(rootDir)}/`);
}

function rootPath(rootDir) {
  return fileURLToPath(rootDir);
}

function readRepoText(rootDir, relativePath) {
  return readFileSync(new URL(relativePath, rootDir), 'utf8');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateReadmeAlphaBadge({ readme, expectedVersion, errors }) {
  const badgeMatch = readme.match(
    /<img src="https:\/\/img\.shields\.io\/badge\/alpha-v([^"]+?)%20public-green" alt="([^"]+)" \/>/
  );

  if (!badgeMatch) {
    errors.push('README.md must include the public alpha version badge.');
    return;
  }

  const badgeVersion = badgeMatch[1];
  const badgeAlt = badgeMatch[2];
  const expectedBadgeAlt = `public alpha v${expectedVersion}`;

  if (badgeVersion !== expectedVersion) {
    errors.push(`README.md alpha badge must be v${expectedVersion}, found v${badgeVersion}.`);
  }

  if (badgeAlt !== expectedBadgeAlt) {
    errors.push(`README.md alpha badge alt must be "${expectedBadgeAlt}", found "${badgeAlt}".`);
  }
}

function validateReadmeWorkflowBadges({ rootDir, readme, errors }) {
  const workflowNames = new Set();
  const workflowLinkPattern = /actions\/workflows\/([^"?#)]+)/g;
  const workflowStatusPattern =
    /img\.shields\.io\/github\/actions\/workflow\/status\/t3x-dev\/t3x-core\/([^"?#)]+)/g;

  for (const match of readme.matchAll(workflowLinkPattern)) {
    workflowNames.add(match[1]);
  }

  for (const match of readme.matchAll(workflowStatusPattern)) {
    workflowNames.add(match[1]);
  }

  for (const workflowName of workflowNames) {
    if (!existsSync(new URL(`.github/workflows/${workflowName}`, rootDir))) {
      errors.push(`README.md references missing workflow .github/workflows/${workflowName}.`);
    }
  }
}

function validateReadmeAvailability({ readme, releaseSurface, errors }) {
  for (const entry of releaseSurface.packages.filter((item) => item.npm_publish === true)) {
    const expectedStatus = `${entry.access} ${entry.stability_tier}`;
    const rowPattern = new RegExp(
      `\\|\\s*\\[\\\`${escapeRegex(entry.name)}\\\`\\]\\(${escapeRegex(
        entry.path
      )}/\\)\\s*\\|\\s*${escapeRegex(expectedStatus)}\\s*\\|`,
      'm'
    );

    if (!rowPattern.test(readme)) {
      errors.push(
        `README.md Availability table must list ${entry.name} at ${entry.path}/ with status "${expectedStatus}".`
      );
    }
  }
}

function validateStabilitySurface({ stability, releaseSurface, errors }) {
  for (const entry of releaseSurface.packages.filter((item) => item.npm_publish === true)) {
    if (!stability.includes(`- \`${entry.name}\``)) {
      errors.push(`docs/stability.md must list ${entry.name} in Current Release Surface.`);
    }
  }

  if (!/public alpha/i.test(stability)) {
    errors.push('docs/stability.md must describe the current surface as public alpha.');
  }
}

function validatePackageReadmeReleaseStatus({ rootDir, releaseSurface, expectedVersion, errors }) {
  for (const entry of releaseSurface.packages.filter((item) => item.npm_publish === true)) {
    const readmePath = `${entry.path}/README.md`;
    if (!existsSync(new URL(readmePath, rootDir))) {
      continue;
    }

    const packageReadme = readRepoText(rootDir, readmePath);
    const expectedSentence = `\`${entry.name}@${expectedVersion}\` is part of the ${entry.access} T3X ${entry.stability_tier} release surface.`;

    if (!packageReadme.includes(expectedSentence)) {
      errors.push(`${readmePath} must include "${expectedSentence}"`);
    }
  }
}

function validateLocalMarkdownLinks({ rootDir, relativePath, errors }) {
  const text = readRepoText(rootDir, relativePath);
  const absolutePath = path.join(rootPath(rootDir), relativePath);
  const baseDir = path.dirname(absolutePath);
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const match of text.matchAll(linkPattern)) {
    const target = match[1].trim();
    if (!target || target.startsWith('#') || /^[a-z]+:/i.test(target) || target.startsWith('//')) {
      continue;
    }

    const pathPart = target.split('#')[0];
    if (!pathPart) {
      continue;
    }

    const resolvedPath = path.resolve(baseDir, pathPart);
    if (!existsSync(resolvedPath)) {
      errors.push(`${relativePath} links to missing local path ${target}.`);
    }
  }
}

export async function validateReleaseDocsAlignment({
  rootDir = new URL('../..', import.meta.url),
} = {}) {
  const rootUrl = toRootUrl(rootDir);
  const errors = [];

  const versionResult = await verifyVersions({
    repoRoot: rootPath(rootUrl),
    verifyManifest: false,
  });
  errors.push(...versionResult.problems);

  const releaseSurface = validateReleaseSurface({ rootDir: rootUrl });
  errors.push(...releaseSurface.errors);

  const readme = readRepoText(rootUrl, 'README.md');
  const stability = readRepoText(rootUrl, 'docs/stability.md');

  if (versionResult.expectedVersion) {
    validateReadmeAlphaBadge({
      readme,
      expectedVersion: versionResult.expectedVersion,
      errors,
    });
    validatePackageReadmeReleaseStatus({
      rootDir: rootUrl,
      releaseSurface,
      expectedVersion: versionResult.expectedVersion,
      errors,
    });
  } else {
    errors.push('Could not resolve current fixed package version.');
  }

  validateReadmeWorkflowBadges({ rootDir: rootUrl, readme, errors });
  validateReadmeAvailability({ readme, releaseSurface, errors });
  validateStabilitySurface({ stability, releaseSurface, errors });
  validateLocalMarkdownLinks({ rootDir: rootUrl, relativePath: 'README.md', errors });
  validateLocalMarkdownLinks({ rootDir: rootUrl, relativePath: 'docs/README.md', errors });
  validateLocalMarkdownLinks({ rootDir: rootUrl, relativePath: 'docs/stability.md', errors });

  return {
    errors,
    expectedVersion: versionResult.expectedVersion,
    releaseSurfaceWarnings: releaseSurface.warnings,
  };
}
