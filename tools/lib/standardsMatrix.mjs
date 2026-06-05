import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

export const STANDARDS_MATRIX_SOURCE_DOC =
  'notes/docs/hlq_docs/alpha/open-source-product-standard.md';

export const STANDARDS_MATRIX_ROW_IDS = [
  'row-1',
  'row-2a',
  'row-2b',
  'row-2c',
  'row-3',
  'row-4',
  'row-5',
  'row-6',
  'row-7',
  'row-8',
];

export const STANDARDS_ACCEPTANCE_TYPES = ['manual', 'automated', 'mixed'];

const STANDARDS_MATRIX_ROW_ID_SET = new Set(STANDARDS_MATRIX_ROW_IDS);
const STANDARDS_ACCEPTANCE_TYPE_SET = new Set(STANDARDS_ACCEPTANCE_TYPES);
const STANDARDS_MATRIX_ROW_KEYS = new Set([
  'id',
  'title',
  'acceptance',
  'acceptance_type',
  'acceptance_command',
  'pr_filter_paths',
  'pr_runs_always',
  'owner_workstream',
]);

function readText(rootDir, relativePath) {
  return readFileSync(new URL(relativePath, rootDir), 'utf8');
}

function loadMatrix(rootDir) {
  return yaml.load(readText(rootDir, 'standards/matrix.yaml'));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPrRouting(row) {
  return row.pr_runs_always === true || row.pr_filter_paths?.length > 0;
}

export function validateStandardsMatrix({ rootDir = new URL('../..', import.meta.url) } = {}) {
  const errors = [];
  const matrix = loadMatrix(rootDir);

  if (!matrix || typeof matrix !== 'object') {
    return {
      errors: ['standards/matrix.yaml must contain a mapping'],
      matrix,
      rows: [],
      rowsById: new Map(),
    };
  }

  if (matrix.version !== 1) {
    errors.push('standards/matrix.yaml version must be 1');
  }

  if (matrix.source_doc !== STANDARDS_MATRIX_SOURCE_DOC) {
    errors.push(`standards/matrix.yaml source_doc must be ${STANDARDS_MATRIX_SOURCE_DOC}`);
  }

  if (!Array.isArray(matrix.rows)) {
    errors.push('standards/matrix.yaml rows must be an array');
  }

  const rows = Array.isArray(matrix.rows) ? matrix.rows : [];
  const rowsById = new Map();
  const seen = new Set();

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object') {
      errors.push(`standards/matrix.yaml rows[${index}] must be a mapping`);
      continue;
    }

    for (const key of Object.keys(row)) {
      if (!STANDARDS_MATRIX_ROW_KEYS.has(key)) {
        errors.push(`standards/matrix.yaml rows[${index}] has unknown field: ${key}`);
      }
    }

    if (!isNonEmptyString(row.id)) {
      errors.push(`standards/matrix.yaml rows[${index}] id must be a non-empty string`);
    } else if (!STANDARDS_MATRIX_ROW_ID_SET.has(row.id)) {
      errors.push(`standards/matrix.yaml rows[${index}] has unknown id: ${row.id}`);
    } else if (seen.has(row.id)) {
      errors.push(`duplicate standards matrix row: ${row.id}`);
    } else {
      seen.add(row.id);
      rowsById.set(row.id, row);
    }

    if (!isNonEmptyString(row.title)) {
      errors.push(`standards/matrix.yaml rows[${index}] title must be a non-empty string`);
    }

    if (!isNonEmptyString(row.acceptance)) {
      errors.push(`standards/matrix.yaml rows[${index}] acceptance must be a non-empty string`);
    }

    if (!isNonEmptyString(row.acceptance_type)) {
      errors.push(
        `standards/matrix.yaml rows[${index}] acceptance_type must be a non-empty string`
      );
    } else if (!STANDARDS_ACCEPTANCE_TYPE_SET.has(row.acceptance_type)) {
      errors.push(
        `standards/matrix.yaml rows[${index}] acceptance_type must be one of ${STANDARDS_ACCEPTANCE_TYPES.join(
          ', '
        )}`
      );
    }

    if (row.acceptance_command !== undefined && !isNonEmptyString(row.acceptance_command)) {
      errors.push(
        `standards/matrix.yaml rows[${index}] acceptance_command must be a non-empty string`
      );
    }

    if (row.pr_filter_paths !== undefined) {
      if (!Array.isArray(row.pr_filter_paths)) {
        errors.push(`standards/matrix.yaml rows[${index}] pr_filter_paths must be an array`);
      } else {
        for (const [pathIndex, path] of row.pr_filter_paths.entries()) {
          if (!isNonEmptyString(path)) {
            errors.push(
              `standards/matrix.yaml rows[${index}] pr_filter_paths[${pathIndex}] must be a non-empty string`
            );
          }
        }
      }
    }

    if (row.pr_runs_always !== undefined && typeof row.pr_runs_always !== 'boolean') {
      errors.push(`standards/matrix.yaml rows[${index}] pr_runs_always must be a boolean`);
    }

    if (!isNonEmptyString(row.owner_workstream)) {
      errors.push(
        `standards/matrix.yaml rows[${index}] owner_workstream must be a non-empty string`
      );
    }

    if (row.acceptance_type === 'automated' || row.acceptance_type === 'mixed') {
      if (!isNonEmptyString(row.acceptance_command)) {
        errors.push(`standards/matrix.yaml row ${row.id} must define acceptance_command`);
      }
      if (!hasPrRouting(row)) {
        errors.push(
          `standards/matrix.yaml row ${row.id} must define pr_filter_paths or set pr_runs_always: true`
        );
      }
    }
  }

  for (const rowId of STANDARDS_MATRIX_ROW_IDS) {
    if (!seen.has(rowId)) {
      errors.push(`standards/matrix.yaml missing ${rowId}`);
    }
  }

  return { errors, matrix, rows, rowsById };
}

export function validateStandardsMatrixOrThrow(options) {
  const result = validateStandardsMatrix(options);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('\n'));
  }
  return result;
}
