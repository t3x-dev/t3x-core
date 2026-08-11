import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
];
const RUNTIME_DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'];
const ALLOWED_LEAF_RUNTIME_PACKAGES = new Set(['json-canonicalize', 'zod']);
const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set(['.turbo', 'coverage', 'dist', 'node_modules']);

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

const FORBIDDEN_RANDOM_APIS = new Set([
  'randomBytes',
  'randomFill',
  'randomFillSync',
  'randomInt',
  'randomUUID',
]);
const CRYPTO_MODULES = new Set(['crypto', 'node:crypto']);

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

function parseSource(source, filePath) {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
}

function stringValue(node) {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function moduleSpecifiers(source, filePath) {
  const specifiers = new Set();
  const sourceFile = parseSource(source, filePath);

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = stringValue(node.moduleSpecifier);
      if (specifier !== undefined) specifiers.add(specifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const specifier = stringValue(node.moduleReference.expression);
      if (specifier !== undefined) specifiers.add(specifier);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) {
        const specifier = stringValue(node.arguments[0]);
        if (specifier !== undefined) specifiers.add(specifier);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...specifiers];
}

function isIdentifier(node, name) {
  return ts.isIdentifier(node) && node.text === name;
}

function isPropertyAccess(node, objectName, propertyName) {
  return (
    ts.isPropertyAccessExpression(node) &&
    isIdentifier(node.expression, objectName) &&
    node.name.text === propertyName
  );
}

function forbiddenLeafUses(source, filePath) {
  const labels = new Set();
  const cryptoNamespaces = new Set(['crypto']);
  const randomBindings = new Set(FORBIDDEN_RANDOM_APIS);
  const sourceFile = parseSource(source, filePath);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!CRYPTO_MODULES.has(stringValue(statement.moduleSpecifier))) continue;

    const importClause = statement.importClause;
    if (importClause?.name !== undefined) cryptoNamespaces.add(importClause.name.text);
    if (importClause?.namedBindings !== undefined) {
      if (ts.isNamespaceImport(importClause.namedBindings)) {
        cryptoNamespaces.add(importClause.namedBindings.name.text);
      } else {
        for (const element of importClause.namedBindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (FORBIDDEN_RANDOM_APIS.has(importedName)) randomBindings.add(element.name.text);
        }
      }
    }
  }

  function visit(node) {
    if (
      isPropertyAccess(node, 'process', 'env') ||
      (ts.isElementAccessExpression(node) &&
        isIdentifier(node.expression, 'process') &&
        stringValue(node.argumentExpression) === 'env')
    ) {
      labels.add('current environment');
    }

    if (
      ts.isNewExpression(node) &&
      isIdentifier(node.expression, 'Date') &&
      (node.arguments === undefined || node.arguments.length === 0)
    ) {
      labels.add('current time');
    }

    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (
        isIdentifier(expression, 'fetch') ||
        isPropertyAccess(expression, 'globalThis', 'fetch')
      ) {
        labels.add('global network access');
      }
      if (isPropertyAccess(expression, 'Date', 'now')) labels.add('current time');
      if (isPropertyAccess(expression, 'performance', 'now')) {
        labels.add('high-resolution clock');
      }
      if (isPropertyAccess(expression, 'Math', 'random')) labels.add('randomness');
      if (ts.isIdentifier(expression) && randomBindings.has(expression.text)) {
        labels.add('randomness');
      }
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        cryptoNamespaces.has(expression.expression.text) &&
        FORBIDDEN_RANDOM_APIS.has(expression.name.text)
      ) {
        labels.add('randomness');
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...labels].sort();
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
  if (manifest.private === true) {
    errors.push('@t3x-dev/transition must be publishable');
  }
  if (manifest.publishConfig?.access !== 'public') {
    errors.push('@t3x-dev/transition publishConfig.access must be public');
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

    for (const label of forbiddenLeafUses(source, file)) {
      errors.push(`${relativeFile} uses forbidden ${label}`);
    }

    for (const specifier of moduleSpecifiers(source, file)) {
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

  const testFiles = sourceFiles(join(packagePath, 'src/__tests__'), { includeTests: true });
  for (const file of testFiles) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = displayPath(rootPath, file);

    for (const label of forbiddenLeafUses(source, file)) {
      errors.push(`${relativeFile} uses forbidden ${label}`);
    }

    for (const specifier of moduleSpecifiers(source, file)) {
      if (specifier.startsWith('@t3x-dev/')) {
        errors.push(`${relativeFile} imports forbidden T3X package ${specifier}`);
        continue;
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
  return files.length + testFiles.length;
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
    for (const specifier of moduleSpecifiers(readFileSync(file, 'utf8'), file)) {
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
