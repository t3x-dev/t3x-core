import * as yaml from 'js-yaml';

export interface FieldSpec {
  type: string; // 'string', 'any', 'boolean', 'mapping', 'sequence'
  required: boolean;
  status: StabilityStatus;
  description: string;
  enum?: string[]; // e.g., ['asc', 'desc']
  default?: unknown;
  item_type?: string;
  deprecated_in?: string;
  replacement_field?: string;
}

export interface TestCase {
  name: string;
  input: unknown;
  ops: unknown[];
  output?: unknown;
  error?: string;
}

/**
 * Naming the field(s) on an op that carry YOps paths.
 *
 *   - `primary`     — single-path ops (e.g. `define.path`, `set.path`).
 *   - `source`      — read-from path on two-path ops (`move.from`, `clone.from`).
 *                     Source paths must already exist at apply time.
 *   - `destination` — write-to path on two-path ops (`move.to`, `clone.to`).
 *                     Destination paths must NOT exist at apply time.
 *
 * Tools that walk an op list (e.g. the extractor compiler's
 * ancestor-define injector) use this metadata instead of pattern-matching
 * each op shape directly. A 19th op only needs to declare its
 * `path_fields` for that tooling to handle it.
 */
export interface PathFields {
  primary?: string;
  source?: string;
  destination?: string;
}

export interface OpSpec {
  name: string;
  category: string; // 'ddl', 'dml', 'dtl', 'dcl'
  status: StabilityStatus;
  description: string;
  path_fields: PathFields;
  fields: Record<string, FieldSpec>;
  errors: string[]; // error codes this op can produce
  rules: string[];
  tests: TestCase[];
}

export interface YOpsSpec {
  name: string;
  version: string;
  description: string;
  operations: Record<string, OpSpec>;
  errors: Record<string, { description: string }>;
  execution: {
    order: string;
    on_error: string;
    immutable_input: boolean;
    idempotent_ops: string[];
    strict_ops: string[];
    readonly_ops: string[];
  };
}

export type StabilityStatus = (typeof STABILITY_STATUSES)[number];

const STABILITY_STATUSES = ['frozen', 'evolving', 'experimental'] as const;
const STABILITY_STATUS_SET = new Set<string>(STABILITY_STATUSES);

type RawField = {
  type: string;
  required?: boolean;
  status?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  item_type?: string;
  deprecated_in?: string | number;
  replacement_field?: string;
};

type RawOp = {
  category: string;
  status?: string;
  description: string;
  path_fields?: PathFields;
  fields?: Record<string, RawField>;
  errors?: Record<string, string>;
  rules?: string[];
  tests?: Array<{
    name: string;
    input: unknown;
    ops: unknown[];
    output?: unknown;
    error?: string;
  }>;
};

type RawSpec = {
  name: string;
  version: string | number;
  description: string;
  operations: Record<string, RawOp>;
  errors: Record<string, { description: string }>;
  execution: {
    order: string;
    on_error: string;
    immutable_input: boolean;
    idempotent_ops: string[];
    strict_ops: string[];
    readonly_ops: string[];
  };
};

function parseStabilityStatus(value: unknown, context: string): StabilityStatus {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${context}: missing required status`);
  }
  if (!STABILITY_STATUS_SET.has(value)) {
    throw new Error(`${context}: status must be one of ${STABILITY_STATUSES.join(', ')}`);
  }
  return value as StabilityStatus;
}

function parseOptionalString(value: unknown, context: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

export function parseSpec(yamlStr: string): YOpsSpec {
  const raw = yaml.load(yamlStr) as RawSpec;

  const operations: Record<string, OpSpec> = {};

  for (const [opName, opDef] of Object.entries(raw.operations)) {
    const fields: Record<string, FieldSpec> = {};
    const opStatus = parseStabilityStatus(opDef.status, opName);

    for (const [fieldName, fieldDef] of Object.entries(opDef.fields ?? {})) {
      const fieldContext = `${opName}.${fieldName}`;
      fields[fieldName] = {
        type: fieldDef.type,
        required: fieldDef.required !== false, // default true if not specified
        status: parseStabilityStatus(fieldDef.status, fieldContext),
        description: fieldDef.description ?? '',
        ...(fieldDef.enum !== undefined && { enum: fieldDef.enum }),
        ...(fieldDef.default !== undefined && { default: fieldDef.default }),
        ...(fieldDef.item_type !== undefined && { item_type: fieldDef.item_type }),
        ...(fieldDef.deprecated_in !== undefined && {
          deprecated_in: parseOptionalString(
            fieldDef.deprecated_in,
            `${fieldContext}.deprecated_in`
          ),
        }),
        ...(fieldDef.replacement_field !== undefined && {
          replacement_field: parseOptionalString(
            fieldDef.replacement_field,
            `${fieldContext}.replacement_field`
          ),
        }),
      };
    }

    const errors = Object.keys(opDef.errors ?? {});

    operations[opName] = {
      name: opName,
      category: opDef.category,
      status: opStatus,
      description: (opDef.description ?? '').trim(),
      path_fields: opDef.path_fields ?? {},
      fields,
      errors,
      rules: opDef.rules ?? [],
      tests: (opDef.tests ?? []).map((t) => ({
        name: t.name,
        input: t.input,
        ops: t.ops,
        ...(t.output !== undefined && { output: t.output }),
        ...(t.error !== undefined && { error: t.error }),
      })),
    };
  }

  const execution = raw.execution;

  return {
    name: raw.name,
    version: String(raw.version),
    description: (raw.description ?? '').trim(),
    operations,
    errors: raw.errors,
    execution: {
      order: execution.order,
      on_error: execution.on_error,
      immutable_input: execution.immutable_input,
      idempotent_ops: execution.idempotent_ops ?? [],
      strict_ops: execution.strict_ops ?? [],
      readonly_ops: execution.readonly_ops ?? [],
    },
  };
}
