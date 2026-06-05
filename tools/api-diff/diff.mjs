#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selectApiSurfacePackages } from '../lib/apiSurface.mjs';

const DECLARATION_START =
  /^(export\s+)?(declare\s+)?(interface|type|function|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)\b/;

function extractCode(snapshotText) {
  return snapshotText.match(/```(?:ts|typescript)?\n([\s\S]*?)\n```/)?.[1] ?? snapshotText;
}

function normalizeDeclaration(declaration) {
  return declaration.replace(/\r\n/g, '\n').trim();
}

function isDeclarationBoundary(line) {
  return DECLARATION_START.test(line) || /^export\s*\{/.test(line);
}

function collectDeclarations(code) {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  const declarations = new Map();
  const directExports = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(DECLARATION_START);
    if (!match) {
      continue;
    }

    let end = index + 1;
    while (end < lines.length && !isDeclarationBoundary(lines[end])) {
      end += 1;
    }

    const name = match[4];
    declarations.set(name, normalizeDeclaration(lines.slice(index, end).join('\n')));
    if (match[1]) {
      directExports.set(name, name);
    }
  }

  return { declarations, directExports };
}

function collectExportBlockSymbols(code) {
  const exports = new Map();
  const exportBlocks = code.matchAll(/export\s*\{([\s\S]*?)\};/g);

  for (const block of exportBlocks) {
    const entries = block[1]
      .split(',')
      .map((entry) => entry.trim().replace(/^type\s+/, ''))
      .filter(Boolean);

    for (const entry of entries) {
      const aliasMatch = entry.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (aliasMatch) {
        exports.set(aliasMatch[2] ?? aliasMatch[1], aliasMatch[1]);
      }
    }
  }

  return exports;
}

export function parseApiSnapshot(snapshotText) {
  const code = extractCode(snapshotText);
  const { declarations, directExports } = collectDeclarations(code);
  const exportedSymbols = new Map([...directExports, ...collectExportBlockSymbols(code)]);
  const exports = new Map();

  for (const [exportName, sourceName] of exportedSymbols) {
    exports.set(exportName, {
      symbol: exportName,
      sourceSymbol: sourceName,
      declaration:
        declarations.get(sourceName) ?? normalizeDeclaration(`export { ${sourceName} };`),
    });
  }

  return { exports };
}

export function diffApiSnapshots({ packageName, before, after }) {
  const beforeExports = parseApiSnapshot(before).exports;
  const afterExports = parseApiSnapshot(after).exports;
  const breaking = [];
  const nonBreaking = [];
  const unchanged = [];

  for (const [symbol, beforeEntry] of beforeExports) {
    const afterEntry = afterExports.get(symbol);
    if (!afterEntry) {
      breaking.push({
        kind: 'removed_export',
        symbol,
        before: beforeEntry.declaration,
      });
    } else if (beforeEntry.declaration !== afterEntry.declaration) {
      breaking.push({
        kind: 'changed_export',
        symbol,
        before: beforeEntry.declaration,
        after: afterEntry.declaration,
      });
    } else {
      unchanged.push(symbol);
    }
  }

  for (const [symbol, afterEntry] of afterExports) {
    if (!beforeExports.has(symbol)) {
      nonBreaking.push({
        kind: 'added_export',
        symbol,
        after: afterEntry.declaration,
      });
    }
  }

  return {
    packageName,
    hasBreakingChanges: breaking.length > 0,
    breaking,
    nonBreaking,
    unchanged,
  };
}

export function formatApiDiffMarkdown(results) {
  const lines = ['## API Surface Diff', ''];
  const changedResults = results.filter(
    (result) => result.breaking.length > 0 || result.nonBreaking.length > 0
  );

  if (changedResults.length === 0) {
    lines.push('No API surface changes detected.');
    return `${lines.join('\n')}\n`;
  }

  for (const result of changedResults) {
    lines.push(`### ${result.packageName}`, '');

    if (result.breaking.length > 0) {
      lines.push('Breaking changes:');
      for (const change of result.breaking) {
        lines.push(`- ${change.kind}: \`${change.symbol}\``);
      }
      lines.push('');
    }

    if (result.nonBreaking.length > 0) {
      lines.push('Non-breaking changes:');
      for (const change of result.nonBreaking) {
        lines.push(`- ${change.kind}: \`${change.symbol}\``);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function rootPath(rootDir) {
  if (rootDir instanceof URL) {
    return fileURLToPath(rootDir);
  }
  return rootDir;
}

function gitObjectExists({ rootDir, object }) {
  try {
    execFileSync('git', ['cat-file', '-e', object], {
      cwd: rootPath(rootDir),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function readGitFile({ rootDir, ref, relativePath }) {
  if (!gitObjectExists({ rootDir, object: `${ref}^{commit}` })) {
    throw new Error(`API diff base ref not found: ${ref}`);
  }

  if (!gitObjectExists({ rootDir, object: `${ref}:${relativePath}` })) {
    return '';
  }

  return execFileSync('git', ['show', `${ref}:${relativePath}`], {
    cwd: rootPath(rootDir),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function diffApiSurfaceFromBase({ rootDir = new URL('../..', import.meta.url), baseRef }) {
  if (!baseRef) {
    throw new Error('--base-ref is required for release surface API diffing');
  }

  return selectApiSurfacePackages({ rootDir }).map((entry) =>
    diffApiSnapshots({
      packageName: entry.name,
      before: readGitFile({
        rootDir,
        ref: baseRef,
        relativePath: entry.snapshotRelativePath,
      }),
      after: readFileSync(join(rootPath(rootDir), entry.snapshotRelativePath), 'utf8'),
    })
  );
}

function parseArgs(argv) {
  const options = {
    rootDir: process.cwd(),
    baseRef: null,
    baseFile: null,
    headFile: null,
    packageName: 'api-surface',
    jsonFile: null,
    markdownFile: null,
    allowBreaking: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.rootDir = requireValue(argv, index);
      index += 1;
    } else if (arg === '--base-ref') {
      options.baseRef = requireValue(argv, index);
      index += 1;
    } else if (arg === '--base') {
      options.baseFile = requireValue(argv, index);
      index += 1;
    } else if (arg === '--head') {
      options.headFile = requireValue(argv, index);
      index += 1;
    } else if (arg === '--package') {
      options.packageName = requireValue(argv, index);
      index += 1;
    } else if (arg === '--json') {
      options.jsonFile = requireValue(argv, index);
      index += 1;
    } else if (arg === '--markdown') {
      options.markdownFile = requireValue(argv, index);
      index += 1;
    } else if (arg === '--allow-breaking') {
      options.allowBreaking = true;
    } else {
      throw new Error(`unknown API diff argument: ${arg}`);
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

function runCli(options) {
  const results =
    options.baseFile && options.headFile
      ? [
          diffApiSnapshots({
            packageName: options.packageName,
            before: readFileSync(options.baseFile, 'utf8'),
            after: readFileSync(options.headFile, 'utf8'),
          }),
        ]
      : diffApiSurfaceFromBase({
          rootDir: pathToFileURL(`${options.rootDir.replace(/\/$/, '')}/`),
          baseRef: options.baseRef,
        });
  const markdown = formatApiDiffMarkdown(results);

  if (options.jsonFile) {
    writeFileSync(options.jsonFile, `${JSON.stringify({ results }, null, 2)}\n`);
  }

  if (options.markdownFile) {
    writeFileSync(options.markdownFile, markdown);
  } else {
    process.stdout.write(markdown);
  }

  process.exitCode =
    !options.allowBreaking && results.some((result) => result.hasBreakingChanges) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
