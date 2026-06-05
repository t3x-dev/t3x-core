import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const REQUIRED_README_SECTIONS = ['what', 'why', 'install', 'sample'];

function readText(rootDir, relativePath) {
  return readFileSync(new URL(relativePath, rootDir), 'utf8');
}

function loadSurface(rootDir) {
  return yaml.load(readText(rootDir, 'release/surface.yaml'));
}

function extractReleaseMarkdownNpmPackages(markdown) {
  const section = markdown.match(/## NPM Release Packages\n([\s\S]*?)(?:\n## |\n$)/)?.[1] ?? '';
  return section
    .split('\n')
    .map((line) => line.match(/^\|\s*`([^`]+)`\s*\|/)?.[1])
    .filter(Boolean);
}

function sameList(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateSurfaceShape(surface, errors) {
  if (!surface || typeof surface !== 'object') {
    errors.push('release/surface.yaml must contain a mapping');
    return;
  }

  if (surface.version !== 1) {
    errors.push('release/surface.yaml version must be 1');
  }

  if (!Array.isArray(surface.packages)) {
    errors.push('release/surface.yaml packages must be an array');
  }
}

function extractMarkdownHeadings(markdown) {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .match(/^#{2,6}\s+(.+?)\s*#*\s*$/)?.[1]
        ?.trim()
        .toLowerCase()
    )
    .filter(Boolean);
}

function validatePackageReadme({ entry, readmePath, errors }) {
  if (!entry.readme_required) {
    return;
  }

  if (!existsSync(readmePath)) {
    errors.push(`${entry.name} requires a README at ${entry.path}/README.md`);
    return;
  }

  const headings = new Set(extractMarkdownHeadings(readFileSync(readmePath, 'utf8')));
  const missingSections = REQUIRED_README_SECTIONS.filter((section) => !headings.has(section));
  if (missingSections.length > 0) {
    errors.push(`${entry.name} README missing required sections: ${missingSections.join(', ')}`);
  }
}

function validatePackageEntry(rootDir, entry, index, errors, warnings) {
  const prefix = `release/surface.yaml packages[${index}]`;
  const required = [
    'name',
    'path',
    'access',
    'publish_state',
    'npm_publish',
    'stability_tier',
    'readme_required',
    'api_extractor',
    'why',
  ];

  for (const field of required) {
    if (!(field in entry)) {
      errors.push(`${prefix} missing ${field}`);
    }
  }

  if (!['public', 'restricted', 'internal'].includes(entry.access)) {
    errors.push(`${prefix} has invalid access: ${entry.access}`);
  }

  if (!['pending', 'applied'].includes(entry.publish_state)) {
    errors.push(`${prefix} has invalid publish_state: ${entry.publish_state}`);
  }

  const packagePath = join(fileURLToPath(rootDir), entry.path);
  const packageJsonPath = join(packagePath, 'package.json');
  if (!existsSync(packageJsonPath)) {
    errors.push(`${entry.name} package.json not found at ${entry.path}`);
    return;
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.name !== entry.name) {
    errors.push(`${entry.name} entry points to package named ${packageJson.name}`);
  }

  if (entry.access !== 'internal') {
    const manifestAccess = packageJson.publishConfig?.access;
    if (manifestAccess !== entry.access) {
      const message = `${entry.name} publishConfig.access is ${manifestAccess ?? 'unset'}, expected ${
        entry.access
      }`;
      if (entry.publish_state === 'pending') {
        warnings.push(
          `${entry.name} publishConfig.access is ${
            manifestAccess ?? 'unset'
          }, pending target is ${entry.access}`
        );
      } else {
        errors.push(`${message} because publish_state is applied`);
      }
    }
  }

  validatePackageReadme({
    entry,
    readmePath: join(packagePath, 'README.md'),
    errors,
  });
}

export function validateReleaseSurface({ rootDir = new URL('../..', import.meta.url) } = {}) {
  const errors = [];
  const warnings = [];
  const surface = loadSurface(rootDir);
  validateSurfaceShape(surface, errors);

  const packages = Array.isArray(surface?.packages) ? surface.packages : [];
  const names = new Set();
  for (const [index, entry] of packages.entries()) {
    if (names.has(entry.name)) {
      errors.push(`duplicate release surface package: ${entry.name}`);
    }
    names.add(entry.name);
    validatePackageEntry(rootDir, entry, index, errors, warnings);
  }

  const npmPublishPackages = packages
    .filter((entry) => entry.npm_publish === true)
    .map((entry) => entry.name);
  const releaseMarkdownNpmPackages = extractReleaseMarkdownNpmPackages(
    readText(rootDir, 'RELEASE.md')
  );

  if (!sameList(npmPublishPackages, releaseMarkdownNpmPackages)) {
    errors.push(
      `RELEASE.md npm release packages [${releaseMarkdownNpmPackages.join(
        ', '
      )}] do not match release/surface.yaml [${npmPublishPackages.join(', ')}]`
    );
  }

  return {
    errors,
    warnings,
    packages,
    packagesByName: new Map(packages.map((entry) => [entry.name, entry])),
    npmPublishPackages,
    releaseMarkdownNpmPackages,
  };
}

export function validateReleaseSurfaceOrThrow(options) {
  const result = validateReleaseSurface(options);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('\n'));
  }
  return result;
}
