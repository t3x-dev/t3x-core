import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const DEFAULT_ROOT = new URL('../..', import.meta.url);
const DECLARATION_RELATIVE_PATH = 'dist/index.d.ts';

function toRootUrl(rootDir) {
  if (rootDir instanceof URL) {
    return rootDir;
  }
  return pathToFileURL(`${rootDir.replace(/\/$/, '')}/`);
}

function rootPath(rootDir) {
  return fileURLToPath(toRootUrl(rootDir));
}

function readText(rootDir, relativePath) {
  return readFileSync(new URL(relativePath, toRootUrl(rootDir)), 'utf8');
}

function packageSnapshotFileName(entry) {
  return `${basename(entry.path)}.api.md`;
}

function packageMetadata(rootDir, entry) {
  const snapshotRelativePath = join(entry.path, 'etc', packageSnapshotFileName(entry));
  const declarationRelativePath = join(entry.path, DECLARATION_RELATIVE_PATH);

  return {
    name: entry.name,
    relativePath: entry.path,
    packageJsonRelativePath: join(entry.path, 'package.json'),
    declarationRelativePath,
    snapshotRelativePath,
    apiExtractorConfigRelativePath: join(entry.path, 'api-extractor.json'),
    packagePath: join(rootPath(rootDir), entry.path),
    declarationPath: join(rootPath(rootDir), declarationRelativePath),
    snapshotPath: join(rootPath(rootDir), snapshotRelativePath),
  };
}

export function selectApiSurfacePackages({ rootDir = DEFAULT_ROOT, packageNames = [] } = {}) {
  const surface = yaml.load(readText(rootDir, 'release/surface.yaml'));
  const packages = Array.isArray(surface?.packages) ? surface.packages : [];
  const packageNameSet = new Set(packageNames);

  return packages
    .filter((entry) => entry.npm_publish === true && entry.api_extractor === true)
    .filter((entry) => packageNameSet.size === 0 || packageNameSet.has(entry.name))
    .map((entry) => packageMetadata(rootDir, entry));
}

export function formatApiSnapshot({ packageName, declarationText }) {
  const normalizedDeclaration = declarationText.replace(/\r\n/g, '\n').trimEnd();

  return `# API Snapshot: ${packageName}

This file is generated from \`dist/index.d.ts\`. Run \`pnpm api-extract -r --local\` to update it.

\`\`\`ts
${normalizedDeclaration}
\`\`\`
`;
}

function buildApiPackages({ rootDir, packages }) {
  for (const entry of packages) {
    execFileSync('pnpm', ['--filter', entry.name, 'build'], {
      cwd: rootPath(rootDir),
      stdio: 'inherit',
    });
  }
}

function generatedSnapshotForPackage(entry) {
  if (!existsSync(entry.declarationPath)) {
    throw new Error(`${entry.name} declaration file not found at ${entry.declarationRelativePath}`);
  }

  return formatApiSnapshot({
    packageName: entry.name,
    declarationText: readFileSync(entry.declarationPath, 'utf8'),
  });
}

export function updateApiSnapshots({
  rootDir = DEFAULT_ROOT,
  build = true,
  packageNames = [],
} = {}) {
  const packages = selectApiSurfacePackages({ rootDir, packageNames });
  if (build) {
    buildApiPackages({ rootDir, packages });
  }

  const updated = packages.map((entry) => {
    const snapshot = generatedSnapshotForPackage(entry);
    mkdirSync(dirname(entry.snapshotPath), { recursive: true });
    writeFileSync(entry.snapshotPath, snapshot);

    return {
      name: entry.name,
      snapshotRelativePath: entry.snapshotRelativePath,
    };
  });

  return { updated };
}

export function verifyApiSnapshots({
  rootDir = DEFAULT_ROOT,
  build = true,
  packageNames = [],
} = {}) {
  const packages = selectApiSurfacePackages({ rootDir, packageNames });
  if (build) {
    buildApiPackages({ rootDir, packages });
  }

  const configErrors = packages
    .filter((entry) => !existsSync(join(rootPath(rootDir), entry.apiExtractorConfigRelativePath)))
    .map((entry) => ({
      name: entry.name,
      configRelativePath: entry.apiExtractorConfigRelativePath,
    }));
  const staleSnapshots = [];
  for (const entry of packages) {
    const expected = generatedSnapshotForPackage(entry);
    const current = existsSync(entry.snapshotPath)
      ? readFileSync(entry.snapshotPath, 'utf8')
      : null;

    if (current !== expected) {
      staleSnapshots.push({
        name: entry.name,
        snapshotRelativePath: entry.snapshotRelativePath,
      });
    }
  }

  return {
    ok: configErrors.length === 0 && staleSnapshots.length === 0,
    checked: packages.map((entry) => ({
      name: entry.name,
      snapshotRelativePath: entry.snapshotRelativePath,
    })),
    configErrors,
    staleSnapshots,
  };
}
