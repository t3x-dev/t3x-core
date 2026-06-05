import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateStandardsMatrixOrThrow } from './standardsMatrix.mjs';

const RESULT_STATUSES = ['pass', 'fail', 'manual', 'skipped'];
const RESULT_STATUS_SET = new Set(RESULT_STATUSES);

function toRootUrl(rootDir) {
  if (rootDir instanceof URL) {
    return rootDir;
  }
  return pathToFileURL(`${resolve(rootDir)}/`);
}

function normalizeRepoPath(value) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function escapeRegex(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(char);
    }
  }
  source += '$';
  return new RegExp(source);
}

export function matchesStandardsPathFilter(filePath, filterPath) {
  const file = normalizeRepoPath(filePath);
  const filter = normalizeRepoPath(filterPath);

  if (filter.endsWith('/**')) {
    const prefix = filter.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }

  if (filter.includes('*') || filter.includes('?')) {
    return globToRegex(filter).test(file);
  }

  return file === filter;
}

function rowMatchesChangedPaths(row, changedPaths) {
  if (row.pr_runs_always === true) {
    return true;
  }

  if (!Array.isArray(row.pr_filter_paths) || row.pr_filter_paths.length === 0) {
    return false;
  }

  return changedPaths.some((changedPath) =>
    row.pr_filter_paths.some((filterPath) => matchesStandardsPathFilter(changedPath, filterPath))
  );
}

export function selectStandardsRows({
  rows,
  mode = 'full',
  changedPaths = [],
  requestedRows = [],
}) {
  const requestedRowSet = new Set(requestedRows);
  const candidateRows =
    requestedRowSet.size > 0 ? rows.filter((row) => requestedRowSet.has(row.id)) : rows;

  if (mode === 'full' || requestedRowSet.size > 0) {
    return candidateRows;
  }

  return candidateRows.filter((row) => rowMatchesChangedPaths(row, changedPaths));
}

export function parseChildResult({ rowId, stdout }) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('child result must be a JSON object on stdout');
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`child result must be valid JSON: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('child result must be a JSON object');
  }

  if (parsed.row_id !== rowId) {
    throw new Error(`row_id must be ${rowId}`);
  }

  if (!RESULT_STATUS_SET.has(parsed.status)) {
    throw new Error(`status must be one of ${RESULT_STATUSES.join(', ')}`);
  }

  if (typeof parsed.summary !== 'string' || parsed.summary.trim().length === 0) {
    throw new Error('summary must be a non-empty string');
  }

  if (
    parsed.details !== undefined &&
    (!Array.isArray(parsed.details) || parsed.details.some((detail) => typeof detail !== 'string'))
  ) {
    throw new Error('details must be an array of strings when provided');
  }

  return {
    row_id: rowId,
    status: parsed.status,
    summary: parsed.summary,
    details: parsed.details ?? [],
  };
}

function readChangedPathsFile(filePath) {
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function runChildCommand({ command, cwd }) {
  return new Promise((resolveCommand) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolveCommand({
        code: 1,
        stdout,
        stderr: stderr ? `${stderr}\n${error.message}` : error.message,
      });
    });
    child.on('close', (code) => {
      resolveCommand({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function summarizeResults({ results, skipped }) {
  return {
    passed: results.filter((result) => result.status === 'pass').length,
    failed: results.filter((result) => result.status === 'fail').length,
    manual: results.filter((result) => result.status === 'manual').length,
    skipped,
  };
}

function validateRequestedRows({ requestedRows, rowsById }) {
  for (const rowId of requestedRows) {
    if (!rowsById.has(rowId)) {
      throw new Error(`unknown standards row requested: ${rowId}`);
    }
  }
}

async function runRow({ row, cwd }) {
  if (!row.acceptance_command) {
    return {
      row_id: row.id,
      title: row.title,
      status: 'manual',
      summary: 'Manual acceptance required.',
      details: [],
    };
  }

  const child = await runChildCommand({ command: row.acceptance_command, cwd });
  try {
    const parsed = parseChildResult({ rowId: row.id, stdout: child.stdout });
    const status = child.code === 0 ? parsed.status : 'fail';
    return {
      row_id: row.id,
      title: row.title,
      status,
      summary:
        status === parsed.status
          ? parsed.summary
          : `${row.id} command exited ${child.code}: ${parsed.summary}`,
      details: child.stderr.trim()
        ? [...parsed.details, `stderr: ${child.stderr.trim()}`]
        : parsed.details,
    };
  } catch (error) {
    return {
      row_id: row.id,
      title: row.title,
      status: 'fail',
      summary: `${row.id} command did not emit a valid standards result: ${error.message}`,
      details: [child.stderr.trim()].filter(Boolean),
    };
  }
}

export async function runStandards({
  rootDir = new URL('../..', import.meta.url),
  mode = 'full',
  changedPaths = [],
  changedPathsFile = null,
  requestedRows = [],
} = {}) {
  if (mode !== 'full' && mode !== 'pr') {
    throw new Error('standards runner mode must be full or pr');
  }

  const rootUrl = toRootUrl(rootDir);
  const rootPath = fileURLToPath(rootUrl);
  const matrixResult = validateStandardsMatrixOrThrow({ rootDir: rootUrl });
  validateRequestedRows({
    requestedRows,
    rowsById: matrixResult.rowsById,
  });

  const effectiveChangedPaths = changedPathsFile
    ? readChangedPathsFile(changedPathsFile)
    : changedPaths;
  const selectedRows = selectStandardsRows({
    rows: matrixResult.rows,
    mode,
    changedPaths: effectiveChangedPaths,
    requestedRows,
  });
  const results = [];

  for (const row of selectedRows) {
    results.push(await runRow({ row, cwd: rootPath }));
  }

  const summary = summarizeResults({
    results,
    skipped: matrixResult.rows.length - selectedRows.length,
  });

  return {
    mode,
    changedPaths: effectiveChangedPaths,
    selectedRows: selectedRows.map((row) => row.id),
    results,
    summary,
    exitCode: summary.failed > 0 ? 1 : 0,
  };
}

export function renderStandardsSummary(runResult) {
  const lines = [
    '# Standards Matrix',
    '',
    `Mode: ${runResult.mode}`,
    '',
    `Passed: ${runResult.summary.passed}`,
    `Failed: ${runResult.summary.failed}`,
    `Manual: ${runResult.summary.manual}`,
    `Skipped: ${runResult.summary.skipped}`,
    '',
    '| Row | Status | Summary |',
    '| --- | --- | --- |',
  ];

  if (runResult.results.length === 0) {
    lines.push('| none | skipped | No affected standards rows. |');
  } else {
    for (const result of runResult.results) {
      lines.push(
        `| ${escapeMarkdownTableCell(result.row_id)} | ${escapeMarkdownTableCell(
          result.status
        )} | ${escapeMarkdownTableCell(result.summary)} |`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function escapeMarkdownTableCell(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}
