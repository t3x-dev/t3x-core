import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
];
const RUNTIME_DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const ALLOWED_LEAF_RUNTIME_PACKAGES = new Set(['json-canonicalize', 'zod']);
const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set(['__tests__', '.turbo', 'coverage', 'dist', 'node_modules']);

const FORBIDDEN_LEAF_MODULES = [
  '@anthropic-ai/sdk',
  'ai',
  'axios',
  'child_process',
  'dgram',
  'dns',
  'fs',
  'http',
  'https',
  'net',
  'node-fetch',
  'node:child_process',
  'node:dgram',
  'node:dns',
  'node:fs',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'openai',
  'pg',
  'postgres',
  'tls',
  'undici',
];

const FORBIDDEN_LEAF_SOURCE = [
  { label: 'current environment', pattern: /\bprocess\.env\b/u },
  { label: 'current time', pattern: /\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/u },
  { label: 'global network access', pattern: /\bfetch\s*\(/u },
  { label: 'high-resolution clock', pattern: /\bperformance\.now\s*\(/u },
  {
    label: 'randomness',
    pattern:
      /\bMath\.random\s*\(|\b(?:crypto\.)?(?:randomBytes|randomFill(?:Sync)?|randomInt|randomUUID)\s*\(/u,
  },
];

function toRootPath(rootDir) {
  return rootDir instanceof URL ? fileURLToPath(rootDir) : resolve(rootDir);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function dependencyNames(manifest) {
  return DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {}));
}

function runtimeDependencyNames(manifest) {
  return RUNTIME_DEPENDENCY_FIELDS.flatMap((field) => Object.keys(manifest[field] ?? {}));
}

function sourceFiles(path) {
  if (!existsSync(path)) return [];

  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(entryPath));
      continue;
    }
    const extension = entry.name.slice(entry.name.lastIndexOf('.'));
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extension)) files.push(entryPath);
  }
  return files.sort();
}

function moduleSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^;]*?\sfrom\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function isWithin(parent, target) {
  const path = relative(parent, target);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function matchesModule(specifier, name) {
  return specifier === name || specifier.startsWith(`${name}/`);
}

function displayPath(rootPath, path) {
  return relative(rootPath, path).split(sep).join('/');
}

function checkTransitionLeaf(rootPath, errors) {
  const packagePath = join(rootPath, 'packages/transition');
  const manifestPath = join(packagePath, 'package.json');
  if (!existsSync(manifestPath)) {
    errors.push('packages/transition/package.json is required');
    return 0;
  }

  const manifest = readJson(manifestPath);
  if (manifest.name !== '@t3x-dev/transition') {
    errors.push('packages/transition must be named @t3x-dev/transition');
  }
  if (manifest.private !== true) {
    errors.push('@t3x-dev/transition must remain private');
  }
  if (manifest.publishConfig?.access !== 'restricted') {
    errors.push('@t3x-dev/transition publishConfig.access must remain restricted');
  }

  for (const dependency of dependencyNames(manifest)) {
    if (dependency.startsWith('@t3x-dev/')) {
      errors.push(`@t3x-dev/transition must not depend on ${dependency}`);
    }
  }
  for (const dependency of runtimeDependencyNames(manifest)) {
    if (dependency.startsWith('@t3x-dev/')) continue;
    if (FORBIDDEN_LEAF_MODULES.some((name) => matchesModule(dependency, name))) {
      errors.push(`@t3x-dev/transition must not depend on impure package ${dependency}`);
    } else if (/(?:^|[/_.-])(prd|esphome)(?:$|[/_.-])/iu.test(dependency)) {
      errors.push(`@t3x-dev/transition must not depend on domain package ${dependency}`);
    } else if (!ALLOWED_LEAF_RUNTIME_PACKAGES.has(dependency)) {
      errors.push(`@t3x-dev/transition has unapproved runtime package ${dependency}`);
    }
  }

  const files = sourceFiles(join(packagePath, 'src'));
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = displayPath(rootPath, file);

    for (const { label, pattern } of FORBIDDEN_LEAF_SOURCE) {
      if (pattern.test(source)) errors.push(`${relativeFile} uses forbidden ${label}`);
    }

    for (const specifier of moduleSpecifiers(source)) {
      if (specifier.startsWith('@t3x-dev/')) {
        errors.push(`${relativeFile} imports forbidden T3X package ${specifier}`);
        continue;
      }
      if (FORBIDDEN_LEAF_MODULES.some((name) => matchesModule(specifier, name))) {
        errors.push(`${relativeFile} imports forbidden impure module ${specifier}`);
      }
      if (/(?:^|[/_.-])(prd|esphome)(?:$|[/_.-])/iu.test(specifier)) {
        errors.push(`${relativeFile} imports forbidden domain module ${specifier}`);
      }
      if (specifier.startsWith('.') || isAbsolute(specifier)) {
        const target = resolve(dirname(file), specifier);
        if (!isWithin(packagePath, target)) {
          errors.push(`${relativeFile} imports outside the Transition leaf: ${specifier}`);
        }
      }
    }
  }
  return files.length;
}

function checkPackageIsolation({ rootPath, packagePath, forbiddenPackage, errors }) {
  const absolutePackagePath = join(rootPath, packagePath);
  const manifestPath = join(absolutePackagePath, 'package.json');
  if (!existsSync(manifestPath)) return 0;

  const manifest = readJson(manifestPath);
  if (dependencyNames(manifest).some((name) => matchesModule(name, forbiddenPackage))) {
    errors.push(`${manifest.name ?? packagePath} must not depend on ${forbiddenPackage}`);
  }

  const forbiddenPath = join(
    rootPath,
    forbiddenPackage === '@t3x-dev/storage' ? 'packages/storage' : 'packages/transition'
  );
  const files = sourceFiles(join(absolutePackagePath, 'src'));
  for (const file of files) {
    const relativeFile = displayPath(rootPath, file);
    for (const specifier of moduleSpecifiers(readFileSync(file, 'utf8'))) {
      const directImport = matchesModule(specifier, forbiddenPackage);
      const relativeImport =
        (specifier.startsWith('.') || isAbsolute(specifier)) &&
        isWithin(forbiddenPath, resolve(dirname(file), specifier));
      const adapterImport =
        forbiddenPackage === '@t3x-dev/transition' && specifier.includes('transition-adapters');
      if (directImport || relativeImport || adapterImport) {
        errors.push(`${relativeFile} crosses the forbidden ${forbiddenPackage} boundary`);
      }
    }
  }
  return files.length;
}

export function validateTransitionBoundaries({ rootDir = new URL('../..', import.meta.url) } = {}) {
  const rootPath = toRootPath(rootDir);
  const errors = [];
  let filesChecked = checkTransitionLeaf(rootPath, errors);

  for (const packagePath of ['packages/yops', 'packages/yschema']) {
    filesChecked += checkPackageIsolation({
      rootPath,
      packagePath,
      forbiddenPackage: '@t3x-dev/transition',
      errors,
    });
  }
  filesChecked += checkPackageIsolation({
    rootPath,
    packagePath: 'packages/core',
    forbiddenPackage: '@t3x-dev/storage',
    errors,
  });

  return { errors: errors.sort(), filesChecked };
}
