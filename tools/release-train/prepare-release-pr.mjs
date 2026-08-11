#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleasePr } from '../lib/releasePr.mjs';
import { validateReleaseSurfaceOrThrow } from '../lib/releaseSurface.mjs';
import {
  normalizePackageSelectionInput,
  planMissingChangesets,
  readChangesets,
  releaseTrainPackageNames,
  writeGeneratedChangesets,
} from './ensure-changesets.mjs';

const rootUrl = new URL('../..', import.meta.url);
const rootPath = fileURLToPath(rootUrl);
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const bumpRank = new Map([
  ['patch', 1],
  ['minor', 2],
  ['major', 3],
]);
const protectedSurfaceFiles = new Set([
  'RELEASE.md',
  'docs/stability.md',
  'release/surface.yaml',
  'release/surface.schema.json',
]);
const releaseInfrastructurePaths = [
  '.changeset/config.json',
  '.github/workflows/release.yml',
  '.github/workflows/release-docs-alignment.yml',
  '.github/workflows/release-readiness.yml',
  '.github/workflows/release-readiness-signoff.yml',
  '.github/workflows/sync-main-into-dev.yml',
  'package.json',
  'pnpm-lock.yaml',
  'tools/publish-package-tarballs.mjs',
  'tools/publish-runtime-release.mjs',
  'tools/verify-versions.mjs',
];
const ignoredCommitPatterns = [
  /^Merge pull request #\d+ from t3x-dev\/automation\/sync-main-into-dev$/,
  /^Merge remote-tracking branch 'origin\/main' into automation\/sync-main-/,
];

export function normalizeVersionInput(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().replace(/[\u3002\uff0e\uff61]/g, '.');
  if (normalized.toLowerCase() === 'auto') {
    return 'auto';
  }
  return normalized.replace(/^v(?=\d)/i, '');
}

function parseArgs(argv) {
  const options = {
    apply: false,
    allowPolicyFailures: false,
    baseBranch: 'main',
    baseRef: 'origin/main',
    draft: false,
    dryRun: true,
    firstPublishPackages: 'none',
    headRef: 'origin/dev',
    mode: 'auto',
    packageBump: 'patch',
    packages: 'auto',
    packageVersion: 'auto',
    version: 'auto',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      options.apply = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      options.apply = false;
      options.dryRun = true;
      continue;
    }
    if (arg === '--draft') {
      options.draft = true;
      continue;
    }
    if (arg === '--allow-policy-failures') {
      options.allowPolicyFailures = true;
      continue;
    }
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

  options.version = normalizeVersionInput(options.version);
  options.packageVersion = normalizeVersionInput(options.packageVersion);
  options.packages = normalizePackageSelectionInput(options.packages);
  options.firstPublishPackages = normalizePackageSelectionInput(options.firstPublishPackages);

  if (!options.version || (options.version !== 'auto' && !semverPattern.test(options.version))) {
    throw new Error('--version must be "auto" or a semantic version like 1.0.1');
  }
  if (
    !options.packageVersion ||
    (options.packageVersion !== 'auto' && !semverPattern.test(options.packageVersion))
  ) {
    throw new Error('--package-version must be "auto" or a semantic version like 1.0.1');
  }
  if (!['auto', 'code-only', 'package'].includes(options.mode)) {
    throw new Error('--mode must be auto, code-only, or package');
  }
  if (!['patch', 'minor', 'major'].includes(options.packageBump)) {
    throw new Error('--package-bump must be patch, minor, or major');
  }
  if (options.apply && options.allowPolicyFailures) {
    throw new Error('--allow-policy-failures is only allowed for dry runs');
  }
  if (options.draft && !options.apply) {
    throw new Error('--draft is only meaningful with --apply');
  }

  return options;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: rootPath,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gh(args, options = {}) {
  return execFileSync('gh', args, {
    cwd: rootPath,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ensureGitRef(ref) {
  try {
    git(['rev-parse', '--verify', ref]);
  } catch {
    throw new Error(`git ref not found: ${ref}. Fetch it first or pass --base-ref/--head-ref.`);
  }
}

function ensureCleanWorktreeForApply() {
  const status = git(['status', '--porcelain']);
  if (!status) {
    return;
  }
  throw new Error(`--apply requires a clean worktree before pushing a release branch:\n${status}`);
}

function readChangedFiles(baseRef, headRef) {
  const output = git(['diff', '--name-only', `${baseRef}...${headRef}`]);
  if (!output) {
    return [];
  }
  return output.split('\n').filter(Boolean).sort();
}

function readPackageVersion(packagePath) {
  const manifest = JSON.parse(readFileSync(join(rootPath, packagePath, 'package.json'), 'utf8'));
  if (!manifest.version) {
    throw new Error(`${packagePath}/package.json does not declare a version`);
  }
  return manifest.version;
}

function bumpVersion(version, bump) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`cannot estimate next package version from non-stable version: ${version}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') {
    return `${major + 1}.0.0`;
  }
  if (bump === 'minor') {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

function packageSlug(packageName) {
  return packageName.replace(/^@t3x-dev\//, '').replace(/[^a-z0-9]+/g, '-');
}

function resolveFirstPublishPackageNames({ packageSelection, releaseSurface }) {
  const normalizedSelection = normalizePackageSelectionInput(packageSelection);
  const lowered = normalizedSelection.toLowerCase();

  if (['auto', 'none', 'no', 'false'].includes(lowered)) {
    return [];
  }

  const activePackageNames = releaseTrainPackageNames({ releaseSurface });
  const activeByName = new Map(activePackageNames.map((name) => [name, name]));
  const activeBySlug = new Map(activePackageNames.map((name) => [packageSlug(name), name]));

  return [
    ...new Set(
      normalizedSelection
        .split(',')
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => {
          const packageName = token.startsWith('@t3x-dev/') ? token : `@t3x-dev/${token}`;
          const resolved = activeByName.get(packageName) ?? activeBySlug.get(token);
          if (!resolved) {
            throw new Error(`${packageName} is not an active release-train package`);
          }
          return resolved;
        })
    ),
  ];
}

function compareVersions(left, right) {
  const leftMatch = left.match(/^(\d+)\.(\d+)\.(\d+)$/);
  const rightMatch = right.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!leftMatch || !rightMatch) {
    throw new Error(`cannot compare non-stable versions: ${left}, ${right}`);
  }

  const leftParts = leftMatch.slice(1).map(Number);
  const rightParts = rightMatch.slice(1).map(Number);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

function highestVersion(versions) {
  return versions.filter(Boolean).sort(compareVersions).at(-1) ?? null;
}

function highestBump(entries) {
  let selected = null;
  for (const entry of entries) {
    if (!selected || bumpRank.get(entry.bump) > bumpRank.get(selected)) {
      selected = entry.bump;
    }
  }
  return selected;
}

function parseCommit(rawLine) {
  const [hash, subject] = rawLine.split('\x01');
  return { hash, subject };
}

function readCommits(baseRef, headRef) {
  const range = `${baseRef}..${headRef}`;
  const output = git(['log', '--reverse', '--format=%H%x01%s', range]);
  if (!output) {
    return [];
  }
  return output.split('\n').filter(Boolean).map(parseCommit);
}

function isIgnoredCommit(commit) {
  return ignoredCommitPatterns.some((pattern) => pattern.test(commit.subject));
}

function releaseWorthyCommits(commits) {
  return commits.filter((commit) => !isIgnoredCommit(commit));
}

function pullRequestLine(commit) {
  const mergeMatch = commit.subject.match(/^Merge pull request #(\d+) from (.+)$/);
  if (mergeMatch) {
    return `- #${mergeMatch[1]} from \`${mergeMatch[2]}\``;
  }
  const prMatch = commit.subject.match(/\(#(\d+)\)$/);
  if (prMatch) {
    return `- #${prMatch[1]} ${commit.subject.replace(/\s+\(#\d+\)$/, '')}`;
  }
  return `- ${commit.subject} (${commit.hash.slice(0, 7)})`;
}

function categorizeCommit(subject) {
  const match = subject.match(/^([a-z]+)(?:\([^)]+\))?!?:\s+(.+)$/);
  const type = match?.[1] ?? 'other';
  if (type === 'feat') {
    return 'Features';
  }
  if (type === 'fix') {
    return 'Fixes';
  }
  if (['perf', 'refactor'].includes(type)) {
    return 'Internals';
  }
  if (['docs'].includes(type)) {
    return 'Docs';
  }
  if (['build', 'chore', 'ci', 'test'].includes(type)) {
    return 'Maintenance';
  }
  return 'Other Changes';
}

function releaseNoteLine(subject) {
  return `- ${subject}`;
}

function buildReleaseNotes(commits) {
  const relevantCommits = releaseWorthyCommits(commits);
  const nonMergeCommits = relevantCommits.filter(
    (commit) => !commit.subject.startsWith('Merge pull request')
  );
  if (nonMergeCommits.length === 0 && relevantCommits.length > 0) {
    return relevantCommits.map(pullRequestLine).join('\n');
  }
  const buckets = new Map();
  for (const commit of nonMergeCommits) {
    const category = categorizeCommit(commit.subject);
    if (!buckets.has(category)) {
      buckets.set(category, []);
    }
    buckets.get(category).push(releaseNoteLine(commit.subject));
  }

  const ordered = ['Features', 'Fixes', 'Internals', 'Docs', 'Maintenance', 'Other Changes'];
  const lines = [];
  for (const category of ordered) {
    const entries = buckets.get(category) ?? [];
    if (entries.length === 0) {
      continue;
    }
    lines.push(`### ${category}`, '', ...entries, '');
  }

  if (lines.length === 0) {
    lines.push('- Release reviewed changes from `dev`.');
  }

  return lines.join('\n').trim();
}

function buildIncludedChanges(commits, baseRef, headRef) {
  const relevantCommits = releaseWorthyCommits(commits);
  const mergeCommits = relevantCommits.filter((commit) =>
    commit.subject.startsWith('Merge pull request')
  );
  const entries = (mergeCommits.length > 0 ? mergeCommits : relevantCommits).map(pullRequestLine);
  if (entries.length === 0) {
    return `- Compare \`${baseRef}...${headRef}\``;
  }
  return entries.join('\n');
}

export function buildPackagePlan({
  changesets,
  firstPublishPackageNames = [],
  mode,
  releaseSurface,
  readVersion = readPackageVersion,
}) {
  const packageEntries = changesets.flatMap((changeset) => changeset.entries);
  const releaseTrainPackages = releaseTrainPackageNames({ releaseSurface });
  const releaseTrainPackageSet = new Set(releaseTrainPackages);
  const pausedReleaseTrainPackageSet = new Set(releaseSurface.pausedReleaseTrainPackages ?? []);
  const activePackageEntries = packageEntries.filter((entry) =>
    releaseTrainPackageSet.has(entry.packageName)
  );
  const pausedPackageEntries = packageEntries.filter((entry) =>
    pausedReleaseTrainPackageSet.has(entry.packageName)
  );
  const hasActivePackageChangesets = activePackageEntries.length > 0;
  const firstPublishPackageSet = new Set(firstPublishPackageNames);
  const hasFirstPublishPackages = firstPublishPackageSet.size > 0;
  const resolvedMode =
    mode === 'auto'
      ? hasActivePackageChangesets || hasFirstPublishPackages
        ? 'package'
        : 'code-only'
      : mode;
  const diagnostics = [];

  for (const packageName of firstPublishPackageSet) {
    if (!releaseTrainPackageSet.has(packageName)) {
      diagnostics.push(`${packageName} is not an active release-train package.`);
    }
    if (activePackageEntries.some((entry) => entry.packageName === packageName)) {
      diagnostics.push(`${packageName} cannot be both first-publish and changeset-bumped.`);
    }
  }

  if (pausedPackageEntries.length > 0) {
    diagnostics.push(
      `changesets target paused release-train package(s): ${[
        ...new Set(pausedPackageEntries.map((entry) => entry.packageName)),
      ].join(', ')}`
    );
  }

  if (resolvedMode === 'code-only' && hasActivePackageChangesets) {
    diagnostics.push(
      `mode code-only is invalid because active package changesets exist: ${[
        ...new Set(activePackageEntries.map((entry) => entry.packageName)),
      ].join(', ')}`
    );
  }

  if (resolvedMode === 'package') {
    if (!hasActivePackageChangesets && !hasFirstPublishPackages) {
      diagnostics.push(
        'mode package requires at least one active package .changeset/*.md file or first-publish package'
      );
    }
  }

  if (resolvedMode === 'code-only') {
    return {
      diagnostics,
      mode: resolvedMode,
      packageReleases: '- None',
    };
  }

  const packageReleases = releaseTrainPackages
    .map((packageName) => {
      const entry = releaseSurface.packagesByName.get(packageName);
      const bump = highestBump(
        activePackageEntries.filter((packageEntry) => packageEntry.packageName === packageName)
      );
      if (!entry || !bump) {
        return null;
      }
      const currentVersion = readVersion(entry.path);
      const nextVersion = bumpVersion(currentVersion, bump);
      return {
        name: entry.name,
        bump,
        version: nextVersion,
        line: `- \`${entry.name}\`: ${nextVersion}`,
      };
    })
    .filter(Boolean);
  const firstPublishReleases = releaseTrainPackages
    .map((packageName) => {
      if (!firstPublishPackageSet.has(packageName)) {
        return null;
      }
      const entry = releaseSurface.packagesByName.get(packageName);
      if (!entry) {
        return null;
      }
      const version = readVersion(entry.path);
      return {
        firstPublish: true,
        name: entry.name,
        version,
        line: `- \`${entry.name}\`: ${version} (first publish)`,
      };
    })
    .filter(Boolean);
  const allPackageReleases = [...packageReleases, ...firstPublishReleases];

  return {
    diagnostics,
    mode: resolvedMode,
    packageReleases: allPackageReleases.map((entry) => entry.line).join('\n'),
    packageVersions: allPackageReleases.map(({ firstPublish = false, name, version }) => ({
      firstPublish,
      name,
      version,
    })),
  };
}

function readProductReleaseVersions() {
  const output = git(['tag', '--list', 't3x-v*']);
  if (!output) {
    return [];
  }

  return output
    .split('\n')
    .map((tag) => tag.match(/^t3x-v(\d+\.\d+\.\d+)$/)?.[1])
    .filter(Boolean);
}

export function resolveVersion({
  readProductVersions = readProductReleaseVersions,
  readVersion = readPackageVersion,
  releaseSurface,
  requestedVersion,
}) {
  if (requestedVersion !== 'auto') {
    return requestedVersion;
  }

  const latestProductVersion = highestVersion(readProductVersions());

  const firstPackage = (releaseSurface.releaseTrainPackages ?? releaseSurface.npmPublishPackages)
    .map((name) => releaseSurface.packagesByName.get(name))
    .find(Boolean);
  if (!firstPackage) {
    throw new Error('cannot infer product release version without npm publish packages');
  }

  const fallbackPackageNextVersion = bumpVersion(readVersion(firstPackage.path), 'patch');
  return latestProductVersion
    ? bumpVersion(latestProductVersion, 'patch')
    : fallbackPackageNextVersion;
}

function changedSurfaceFiles(changedFiles) {
  return changedFiles.filter((file) => protectedSurfaceFiles.has(file));
}

function buildReleaseSurfaceSection(files) {
  if (files.length === 0) {
    return '';
  }
  return `\n## Release Surface\n\n- Release train detected protected release surface changes: ${files
    .map((file) => `\`${file}\``)
    .join(
      ', '
    )}.\n- Owner review must confirm the public npm release surface and stability wording remain intentional.\n`;
}

function packageVisibleWarnings({
  changedFiles,
  changesets,
  firstPublishPackageNames = [],
  releaseSurface,
}) {
  const warnings = [];
  const changesetPackages = new Set(
    changesets.flatMap((changeset) => changeset.entries).map((entry) => entry.packageName)
  );
  const firstPublishPackageSet = new Set(firstPublishPackageNames);
  const npmEntries = releaseSurface.releaseTrainPackages
    .map((name) => releaseSurface.packagesByName.get(name))
    .filter(Boolean);

  for (const entry of npmEntries) {
    const packagePath = `${entry.path}/`;
    const packageChanged = changedFiles.some(
      (file) => file === entry.path || file.startsWith(packagePath)
    );
    if (
      packageChanged &&
      !changesetPackages.has(entry.name) &&
      !firstPublishPackageSet.has(entry.name)
    ) {
      warnings.push(
        `${entry.name} changed under ${entry.path} without a matching changeset; confirm code-only release is intentional or add a changeset.`
      );
    }
  }

  const infrastructureChanges = changedFiles.filter((file) =>
    releaseInfrastructurePaths.some(
      (releasePath) => file === releasePath || file.startsWith(`${releasePath}/`)
    )
  );
  if (infrastructureChanges.length > 0 && changesets.length === 0) {
    warnings.push(
      `release/package infrastructure changed without changesets: ${infrastructureChanges.join(', ')}.`
    );
  }

  return warnings;
}

function renderWarnings(warnings) {
  return warnings.length > 0
    ? warnings.map((warning) => `- REVIEW REQUIRED: ${warning}`).join('\n')
    : '- Release train generated draft; review CI and readiness report before merge.';
}

export function buildPullRequestBody({
  baseRef,
  changesets,
  changedFiles = [],
  commits,
  headRef,
  packagePlan,
  version,
  warnings = [],
}) {
  const risks =
    packagePlan.diagnostics.length > 0
      ? packagePlan.diagnostics.map((item) => `- BLOCKED: ${item}`).join('\n')
      : renderWarnings(warnings);
  const surfaceSection = buildReleaseSurfaceSection(changedSurfaceFiles(changedFiles));

  return `## Release PR

Promotes a reviewed product release into \`main\`.

## Product Release

T3X product release version: \`${version}\`

Expected product tag after merge:

- \`t3x-v${version}\`

## Included Changes

${buildIncludedChanges(commits, baseRef, headRef)}

## Package Releases

${packagePlan.packageReleases}

## Required Checks

- [ ] PR Validation passed
- [ ] Release surface check passed
- [ ] Local/runtime smoke reviewed when \`@t3x-dev/local\` is affected
- [ ] No-key demo smoke reviewed when demo/runtime behavior is affected
- [ ] Owner review requested when protected release, workflow, or ownership files changed

## Packaging Notes

- Product release version is independent from npm package versions.
- Package publish is optional and happens only through Changesets/version PRs.
- Scheduled Release Train runs default to code-only; package release mode and packages must be selected explicitly.
- Package releases may publish an active package subset; versions are derived per package from its changeset bump.
- \`@t3x-dev/local\` is paused in the release train and is not published by the scheduled flow.
- Release train mode: \`${packagePlan.mode}\`.
- Changesets included: ${changesets.length > 0 ? changesets.map((item) => `\`${item.name}\``).join(', ') : 'None'}.
- Changed files compared with \`${baseRef}...${headRef}\`: ${changedFiles.length}.
${surfaceSection}

## Release Notes

${buildReleaseNotes(commits)}

## Known Risks

${risks}
`;
}

function buildPlan(options) {
  ensureGitRef(options.baseRef);
  ensureGitRef(options.headRef);
  const releaseSurface = validateReleaseSurfaceOrThrow({ rootDir: rootUrl });
  const firstPublishPackageNames = resolveFirstPublishPackageNames({
    packageSelection: options.firstPublishPackages,
    releaseSurface,
  });
  const initialChangesets = readChangesets({ rootDir: rootPath });
  const commits = readCommits(options.baseRef, options.headRef);
  const changedFiles = readChangedFiles(options.baseRef, options.headRef);
  const changesetPlan = planMissingChangesets({
    changesets: initialChangesets,
    hasReleaseChanges: changedFiles.length > 0,
    mode: options.mode,
    packageBump: options.packageBump,
    packageSelection: options.packages,
    readVersion: readPackageVersion,
    releaseSurface,
    requestedVersion: options.packageVersion,
  });
  const changesets = changesetPlan.changesets;
  const effectiveChangedFiles = [
    ...new Set([
      ...changedFiles,
      ...changesetPlan.generatedChangesets.map((changeset) => changeset.name),
    ]),
  ].sort();
  const packagePlan = buildPackagePlan({
    changesets,
    firstPublishPackageNames,
    mode: options.mode,
    releaseSurface,
  });
  const noOp = changesets.length === 0 && effectiveChangedFiles.length === 0;
  const version = resolveVersion({
    releaseSurface,
    requestedVersion: options.version,
  });
  const branch = `release/${version}`;
  const title = `release: ${version}`;
  const warnings = packageVisibleWarnings({
    changedFiles: effectiveChangedFiles,
    changesets,
    firstPublishPackageNames,
    releaseSurface,
  });
  const body = buildPullRequestBody({
    baseRef: options.baseRef,
    changesets,
    changedFiles: effectiveChangedFiles,
    commits,
    headRef: options.headRef,
    packagePlan,
    version,
    warnings,
  });
  const releasePrErrors = noOp
    ? []
    : validateReleasePr({
        baseBranch: options.baseBranch,
        headBranch: branch,
        body,
        changedFiles: effectiveChangedFiles,
        currentPackageVersions: new Map(
          releaseSurface.releaseTrainPackages.map((packageName) => {
            const entry = releaseSurface.packagesByName.get(packageName);
            return [packageName, entry ? readPackageVersion(entry.path) : null];
          })
        ),
        changesetFiles: changesets.map((changeset) => ({
          name: changeset.name.replace(/^\.changeset\//, ''),
          packages: changeset.entries.map((entry) => entry.packageName),
        })),
        pausedReleaseSurfacePackages: releaseSurface.pausedReleaseTrainPackages,
        releaseSurfacePackages: releaseSurface.releaseTrainPackages,
      }).errors.map((error) => `generated release PR body failed policy: ${error}`);

  return {
    body,
    branch,
    changedFiles: effectiveChangedFiles,
    diagnostics: [...packagePlan.diagnostics, ...releasePrErrors],
    generatedChangesets: changesetPlan.generatedChangesets,
    noOp,
    packagePlan,
    packageSelection: options.packages,
    packageBump: options.packageBump,
    packageVersion: options.packageVersion,
    firstPublishPackages: options.firstPublishPackages,
    requestedVersion: options.version,
    title,
    version,
    warnings,
  };
}

function applyPlan(options, plan) {
  if (plan.noOp) {
    console.log('No release-worthy changes were found; no release PR was created.');
    return;
  }
  ensureCleanWorktreeForApply();

  const token = process.env.RELEASE_TRAIN_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('RELEASE_TRAIN_TOKEN, GH_TOKEN, or GITHUB_TOKEN is required for --apply');
  }
  if (!process.env.GITHUB_REPOSITORY) {
    throw new Error('GITHUB_REPOSITORY is required for --apply');
  }

  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  git([
    'remote',
    'set-url',
    'origin',
    `https://x-access-token:${token}@github.com/${process.env.GITHUB_REPOSITORY}.git`,
  ]);
  git(['checkout', '-B', plan.branch, options.headRef], { stdio: 'inherit' });
  if (plan.generatedChangesets.length > 0) {
    const writtenPaths = writeGeneratedChangesets({
      generatedChangesets: plan.generatedChangesets,
      rootDir: rootPath,
    });
    git(['add', ...writtenPaths], { stdio: 'inherit' });
    git(['commit', '-m', `chore: add release train changesets for ${plan.version}`], {
      stdio: 'inherit',
    });
  }
  git(['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${plan.branch}`], {
    stdio: 'inherit',
  });

  const tempDir = mkdtempSync(join(tmpdir(), 't3x-release-train-'));
  const bodyFile = join(tempDir, 'release-pr.md');
  writeFileSync(bodyFile, plan.body);
  try {
    const prNumber = gh([
      'pr',
      'list',
      '--base',
      options.baseBranch,
      '--head',
      plan.branch,
      '--state',
      'open',
      '--json',
      'number',
      '--jq',
      '.[0].number // empty',
    ]);

    if (prNumber) {
      gh(['pr', 'edit', prNumber, '--title', plan.title, '--body-file', bodyFile], {
        stdio: 'inherit',
      });
      console.log(`updated release PR #${prNumber}`);
    } else {
      const createArgs = [
        'pr',
        'create',
        '--base',
        options.baseBranch,
        '--head',
        plan.branch,
        '--title',
        plan.title,
        '--body-file',
        bodyFile,
      ];
      if (options.draft) {
        createArgs.push('--draft');
      }
      gh(createArgs, { stdio: 'inherit' });
    }
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function printDryRun(options, plan) {
  console.log('Release Train dry run');
  console.log(`requested version: ${plan.requestedVersion}`);
  console.log(`resolved version: ${plan.version}`);
  console.log(`mode: ${plan.packagePlan.mode}`);
  console.log(`packages: ${plan.packageSelection}`);
  console.log(`first publish packages: ${plan.firstPublishPackages}`);
  console.log(`package bump: ${plan.packageBump}`);
  console.log(`package target version: ${plan.packageVersion}`);
  console.log(`branch: ${plan.branch}`);
  console.log(`base: ${options.baseBranch}`);
  console.log(`draft PR: ${options.draft ? 'yes' : 'no'}`);
  console.log(`changed files: ${plan.changedFiles.length}`);
  console.log('');
  console.log('No remote writes were performed.');
  console.log('');
  if (plan.noOp) {
    console.log('No release-worthy changes were found between base and head.');
    console.log('No release PR would be created with --apply.');
    return;
  }
  if (plan.diagnostics.length > 0) {
    console.log('Policy diagnostics:');
    for (const diagnostic of plan.diagnostics) {
      console.log(`- ${diagnostic}`);
    }
    console.log('');
  }
  if (plan.warnings.length > 0) {
    console.log('Review warnings:');
    for (const warning of plan.warnings) {
      console.log(`- ${warning}`);
    }
    console.log('');
  }
  if (plan.generatedChangesets.length > 0) {
    console.log('Generated changesets:');
    for (const changeset of plan.generatedChangesets) {
      console.log(
        `- ${changeset.name}: ${changeset.entries[0].packageName} ${changeset.entries[0].bump}`
      );
    }
    console.log('');
  }
  console.log('Would run with --apply:');
  console.log(`- git checkout -B ${plan.branch} ${options.headRef}`);
  if (plan.generatedChangesets.length > 0) {
    console.log(`- git commit generated release train changesets`);
  }
  console.log(`- git push --force-with-lease origin HEAD:refs/heads/${plan.branch}`);
  console.log(
    `- gh pr create/edit --base ${options.baseBranch} --head ${plan.branch}${
      options.draft ? ' --draft' : ''
    }`
  );
  console.log('');
  console.log('--- PR TITLE ---');
  console.log(plan.title);
  console.log('');
  console.log('--- PR BODY ---');
  console.log(plan.body);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = buildPlan(options);

  if (plan.diagnostics.length > 0 && !options.allowPolicyFailures) {
    const details = plan.diagnostics.map((item) => `- ${item}`).join('\n');
    throw new Error(`release train policy checks failed:\n${details}`);
  }

  if (options.apply) {
    applyPlan(options, plan);
  } else {
    printDryRun(options, plan);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
}
