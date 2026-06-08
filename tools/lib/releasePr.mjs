import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const releaseBranchPattern = /^release\/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const hotfixBranchPattern = /^hotfix\/.+/;
const changesetsBranchPattern = /^changesets?-release\/main$/;
const productVersionPattern =
  /^T3X product release version:\s*`?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`?\s*$/im;
const protectedSurfaceFiles = new Set([
  'RELEASE.md',
  'docs/stability.md',
  'release/surface.yaml',
  'release/surface.schema.json',
]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sectionText(body, heading) {
  return (
    body.match(
      new RegExp(`(?:^|\\n)## ${escapeRegex(heading)}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`)
    )?.[1] ?? ''
  );
}

function hasNonEmptyBullet(section) {
  return section.split('\n').some((line) => /^-\s+\S/.test(line.trim()) && line.trim() !== '-');
}

function hasNonEmptyText(section) {
  return section
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line.length > 0 && line !== '-' && !line.startsWith('<!--'));
}

function normalizePackageName(value) {
  return value.replace(/^`|`$/g, '').trim();
}

export function parsePackageReleaseSection(section) {
  const lines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '));

  const none = lines.some((line) => /^-\s+None\s*$/i.test(line));
  const packages = lines
    .map((line) => line.match(/^-\s+(`?@t3x-dev\/[a-z0-9-]+`?)\s*:/)?.[1])
    .filter(Boolean)
    .map(normalizePackageName);

  return {
    none,
    packages: [...new Set(packages)],
    hasEntries: none || packages.length > 0,
  };
}

function parseProductReleaseVersion(body) {
  return body.match(productVersionPattern)?.[1] ?? null;
}

export function parseChangesetPackages(markdown) {
  const frontmatter = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)?.[1] ?? '';
  return frontmatter
    .split('\n')
    .map((line) => line.match(/^\s*["']?(@[^"':\s]+\/[^"':\s]+|[^"':\s]+)["']?\s*:/)?.[1])
    .filter(Boolean);
}

export function readChangesetFiles({ rootDir = process.cwd() } = {}) {
  const changesetDir = join(rootDir, '.changeset');
  if (!existsSync(changesetDir)) {
    return [];
  }

  return readdirSync(changesetDir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
    .map((name) => {
      const path = join(changesetDir, name);
      const content = readFileSync(path, 'utf8');
      return {
        name,
        path,
        packages: parseChangesetPackages(content),
      };
    });
}

export function validateProtectedSurfaceChange({ changedFiles = [], body = '' }) {
  const changedSurfaceFiles = changedFiles.filter((file) => protectedSurfaceFiles.has(file));
  if (changedSurfaceFiles.length === 0) {
    return { errors: [] };
  }

  const hasReleaseSurfaceExplanation = hasNonEmptyText(sectionText(body, 'Release Surface'));
  const hasStabilityExplanation = hasNonEmptyText(sectionText(body, 'Stability'));
  if (hasReleaseSurfaceExplanation || hasStabilityExplanation) {
    return { errors: [] };
  }

  return {
    errors: [
      `surface changes to ${changedSurfaceFiles.join(
        ', '
      )} require a Stability or Release Surface explanation in the PR body.`,
    ],
  };
}

function validatePackageReleases({
  errors,
  packageReleases,
  changesetFiles,
  releaseSurfacePackages,
}) {
  if (!packageReleases.hasEntries) {
    errors.push(
      'main release PRs must include a Package Releases section with "- None" or package entries.'
    );
    return;
  }

  if (packageReleases.none && packageReleases.packages.length > 0) {
    errors.push('Package Releases cannot include "None" together with package entries.');
  }

  if (packageReleases.none && changesetFiles.length > 0) {
    errors.push(
      `Package Releases is "None", but changeset files exist: ${changesetFiles
        .map((file) => file.name)
        .join(', ')}.`
    );
  }

  if (packageReleases.packages.length > 0 && changesetFiles.length === 0) {
    errors.push('Package Releases lists packages, but no .changeset/*.md files were found.');
  }

  const changesetPackages = new Set(changesetFiles.flatMap((file) => file.packages));
  const releaseSurfacePackageSet = new Set(releaseSurfacePackages);
  for (const packageName of packageReleases.packages) {
    if (!changesetPackages.has(packageName)) {
      errors.push(`Package Releases lists ${packageName}, but no changeset targets it.`);
    }
  }

  for (const packageName of changesetPackages) {
    if (
      releaseSurfacePackageSet.has(packageName) &&
      !packageReleases.packages.includes(packageName)
    ) {
      errors.push(`changeset targets ${packageName}, but Package Releases does not list it.`);
    }
  }
}

function validateProductReleaseBody({
  body,
  branchVersion = null,
  changesetFiles = [],
  releaseSurfacePackages,
}) {
  const errors = [];
  const version = parseProductReleaseVersion(body);

  if (!version) {
    errors.push('main release PRs must include "T3X product release version: `x.y.z`".');
  }

  if (branchVersion && version && version !== branchVersion) {
    errors.push(
      `release branch version ${branchVersion} does not match PR body product release version ${version}.`
    );
  }

  if (
    !body.includes('## Included Changes') ||
    !hasNonEmptyBullet(sectionText(body, 'Included Changes'))
  ) {
    errors.push('main release PRs must list at least one included change.');
  }

  if (
    !body.includes('## Release Notes') ||
    !hasNonEmptyBullet(sectionText(body, 'Release Notes'))
  ) {
    errors.push('main release PRs must include user-facing release notes.');
  }

  if (!body.includes('## Package Releases')) {
    errors.push('main release PRs must include a Package Releases section.');
  }
  validatePackageReleases({
    errors,
    packageReleases: parsePackageReleaseSection(sectionText(body, 'Package Releases')),
    changesetFiles,
    releaseSurfacePackages,
  });

  return errors;
}

export function validateReleasePr({
  baseBranch,
  headBranch,
  body = '',
  changesetFiles = [],
  changedFiles = [],
  releaseSurfacePackages = [],
}) {
  const errors = [];
  errors.push(...validateProtectedSurfaceChange({ changedFiles, body }).errors);

  if (!baseBranch || baseBranch !== 'main') {
    return { errors };
  }

  if (changesetsBranchPattern.test(headBranch)) {
    return { errors };
  }

  const releaseMatch = headBranch.match(releaseBranchPattern);
  const isHotfix = hotfixBranchPattern.test(headBranch);

  if (!releaseMatch && !isHotfix) {
    errors.push(
      'PRs targeting main must come from release/x.y.z, hotfix/*, or changeset-release/main.'
    );
    return { errors };
  }

  errors.push(
    ...validateProductReleaseBody({
      body,
      branchVersion: releaseMatch?.[1] ?? null,
      changesetFiles,
      releaseSurfacePackages,
    })
  );

  return { errors };
}
