import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set(['.turbo', 'coverage', 'dist', 'node_modules']);

const COMPATIBILITY_WRITER_PATTERNS = [
  'commitFromDraft',
  'createMergeDraft',
  'commitMergeDraft',
  'prepareRepositoryYOpsMerge',
  'commitRepositoryYOpsMerge',
];
const MCP_HARDCODED_ACTORS = ['human:mcp-local', 'agent:mcp-merge'];

function toRootPath(rootDir) {
  return rootDir instanceof URL ? fileURLToPath(rootDir) : resolve(rootDir);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sourceFiles(path, { includeTests = false } = {}) {
  if (!existsSync(path)) return [];

  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    if (entry.isDirectory() && entry.name === '__tests__' && !includeTests) continue;
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath, { includeTests }));
      continue;
    }

    const extension = entry.name.slice(entry.name.lastIndexOf('.'));
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extension)) files.push(entryPath);
  }

  return files.sort();
}

function displayPath(rootPath, path) {
  return relative(rootPath, path).split(sep).join('/');
}

function countLines(source) {
  if (source.length === 0) return 0;
  return source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
}

function includesImport(source, packageName) {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:from\\s+['"]${escapedPackage}(?:\\/[^'"]*)?['"]|import\\(\\s*['"]${escapedPackage}(?:\\/[^'"]*)?['"]\\s*\\))`
  ).test(source);
}

function matchingFiles(rootPath, paths, matcher) {
  return paths
    .filter((file) => matcher(readFileSync(file, 'utf8'), file))
    .map((file) => displayPath(rootPath, file))
    .sort();
}

function summarizeTransitionControlPlane(rootPath) {
  const controlPlanePath = join(rootPath, 'packages/api/src/lib/transition-control-plane');
  return sourceFiles(controlPlanePath).map((file) => {
    const source = readFileSync(file, 'utf8');
    return {
      path: displayPath(rootPath, file),
      lines: countLines(source),
    };
  });
}

function summarizeApiRouteAuthorization(rootPath) {
  const routeFiles = sourceFiles(join(rootPath, 'packages/api/src/routes')).filter(
    (file) => file.endsWith('.openapi.ts') || file.endsWith(`${sep}ws.ts`)
  );

  const withGetDB = matchingFiles(rootPath, routeFiles, (source) => /\bgetDB\b/.test(source));
  const withProjectAccess = matchingFiles(rootPath, routeFiles, (source) =>
    /\bassertProjectAccess\b/.test(source)
  );
  const withTransitionAuthority = matchingFiles(rootPath, routeFiles, (source) =>
    /\brequireTransitionAuthority\b/.test(source)
  );

  return {
    routeFiles: routeFiles.length,
    filesUsingGetDB: withGetDB.length,
    filesUsingAssertProjectAccess: withProjectAccess.length,
    filesUsingRequireTransitionAuthority: withTransitionAuthority.length,
    getDBWithoutProjectAccess: withGetDB.filter((path) => !withProjectAccess.includes(path)).sort(),
  };
}

function summarizeCompatibilityWriters(rootPath) {
  const files = [
    ...sourceFiles(join(rootPath, 'packages/api/src')),
    ...sourceFiles(join(rootPath, 'packages/mcp/src')),
    ...sourceFiles(join(rootPath, 'apps/web/src')),
    ...sourceFiles(join(rootPath, 'apps/cli/src')),
  ];

  const references = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const patterns = COMPATIBILITY_WRITER_PATTERNS.filter((pattern) =>
      new RegExp(`\\b${pattern}\\b`).test(source)
    );
    if (patterns.length === 0) continue;
    references.push({
      path: displayPath(rootPath, file),
      patterns,
    });
  }

  return references.sort((left, right) => left.path.localeCompare(right.path));
}

function summarizeSurfaceStorageImports(rootPath) {
  const surfaces = [
    ['apps/cli/src', 'cli'],
    ['apps/web/src', 'web'],
    ['packages/mcp/src', 'mcp'],
  ];

  return surfaces
    .map(([sourcePath, surface]) => {
      const files = sourceFiles(join(rootPath, sourcePath));
      return {
        surface,
        files: matchingFiles(rootPath, files, (source) =>
          includesImport(source, '@t3x-dev/storage')
        ),
      };
    })
    .filter((entry) => entry.files.length > 0);
}

function summarizeMcpHardcodedActors(rootPath) {
  const files = sourceFiles(join(rootPath, 'packages/mcp/src'));
  const references = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const actors = MCP_HARDCODED_ACTORS.filter((actor) => source.includes(actor));
    if (actors.length === 0) continue;
    references.push({
      path: displayPath(rootPath, file),
      actors,
    });
  }
  return references.sort((left, right) => left.path.localeCompare(right.path));
}

function summarizeYOps(rootPath) {
  const specPath = join(rootPath, 'packages/yops/yops.yaml');
  if (!existsSync(specPath)) return { operations: [] };
  const lines = readFileSync(specPath, 'utf8').split('\n');
  const operations = [];
  let insideOperations = false;
  for (const line of lines) {
    if (line.trim() === 'operations:') {
      insideOperations = true;
      continue;
    }
    if (!insideOperations) continue;
    if (/^\S/.test(line)) break;

    const match = /^ {2}([A-Za-z][A-Za-z0-9_-]*):\s*$/.exec(line);
    if (match) operations.push(match[1]);
  }

  return {
    operations: operations.sort(),
  };
}

function summarizeReviewSnapshots(rootPath) {
  const files = [
    ...sourceFiles(join(rootPath, 'packages')),
    ...sourceFiles(join(rootPath, 'apps')),
  ];
  return matchingFiles(rootPath, files, (source) =>
    /\bReviewSnapshot\b|\breviewSnapshot\b/.test(source)
  );
}

function summarizeApplicationPackage(rootPath) {
  const manifestPath = join(rootPath, 'packages/application/package.json');
  if (!existsSync(manifestPath)) return { exists: false };

  const manifest = readJson(manifestPath);
  return {
    exists: true,
    name: manifest.name ?? null,
    private: manifest.private === true,
  };
}

export function collectArchitectureInventory({ rootDir = new URL('../..', import.meta.url) } = {}) {
  const rootPath = toRootPath(rootDir);
  const yops = summarizeYOps(rootPath);

  return {
    version: 1,
    scope: 'phase-3-application-convergence',
    applicationPackage: summarizeApplicationPackage(rootPath),
    transitionControlPlane: summarizeTransitionControlPlane(rootPath),
    apiRouteAuthorization: summarizeApiRouteAuthorization(rootPath),
    compatibilityWriterReferences: summarizeCompatibilityWriters(rootPath),
    surfaceStorageImports: summarizeSurfaceStorageImports(rootPath),
    mcpHardcodedActors: summarizeMcpHardcodedActors(rootPath),
    yops: {
      operationCount: yops.operations.length,
      operations: yops.operations,
    },
    reviewSnapshotReferences: summarizeReviewSnapshots(rootPath),
  };
}

export function formatArchitectureInventory(inventory) {
  const controlPlaneLines = inventory.transitionControlPlane.reduce(
    (total, file) => total + file.lines,
    0
  );
  const storageImportCount = inventory.surfaceStorageImports.reduce(
    (total, entry) => total + entry.files.length,
    0
  );

  return [
    `application package: ${inventory.applicationPackage.exists ? 'present' : 'missing'}`,
    `transition control-plane files: ${inventory.transitionControlPlane.length} (${controlPlaneLines} lines)`,
    `api route files: ${inventory.apiRouteAuthorization.routeFiles}`,
    `api route files using getDB: ${inventory.apiRouteAuthorization.filesUsingGetDB}`,
    `api route files using assertProjectAccess: ${inventory.apiRouteAuthorization.filesUsingAssertProjectAccess}`,
    `api route files using requireTransitionAuthority: ${inventory.apiRouteAuthorization.filesUsingRequireTransitionAuthority}`,
    `compatibility writer files: ${inventory.compatibilityWriterReferences.length}`,
    `surface storage import files: ${storageImportCount}`,
    `mcp hardcoded actor files: ${inventory.mcpHardcodedActors.length}`,
    `yops operations: ${inventory.yops.operationCount}`,
    `review snapshot references: ${inventory.reviewSnapshotReferences.length}`,
  ].join('\n');
}
