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

const STANDARDS_MATRIX_ROW_ID_SET = new Set(STANDARDS_MATRIX_ROW_IDS);

function readText(rootDir, relativePath) {
  return readFileSync(new URL(relativePath, rootDir), 'utf8');
}

function loadMatrix(rootDir) {
  return yaml.load(readText(rootDir, 'standards/matrix.yaml'));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
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
