import * as yaml from 'js-yaml';

export interface FieldSpec {
  type: string;        // 'string', 'any', 'boolean', 'mapping', 'sequence'
  required: boolean;
  description: string;
  enum?: string[];     // e.g., ['asc', 'desc']
  default?: unknown;
  item_type?: string;
}

export interface TestCase {
  name: string;
  input: unknown;
  ops: unknown[];
  output?: unknown;
  error?: string;
}

export interface OpSpec {
  name: string;
  category: string;    // 'ddl', 'dml', 'dtl', 'dcl'
  description: string;
  fields: Record<string, FieldSpec>;
  errors: string[];    // error codes this op can produce
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

type RawField = {
  type: string;
  required?: boolean;
  description?: string;
  enum?: string[];
  default?: unknown;
  item_type?: string;
};

type RawOp = {
  category: string;
  description: string;
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

export function parseSpec(yamlStr: string): YOpsSpec {
  const raw = yaml.load(yamlStr) as RawSpec;

  const operations: Record<string, OpSpec> = {};

  for (const [opName, opDef] of Object.entries(raw.operations)) {
    const fields: Record<string, FieldSpec> = {};

    for (const [fieldName, fieldDef] of Object.entries(opDef.fields ?? {})) {
      fields[fieldName] = {
        type: fieldDef.type,
        required: fieldDef.required !== false,   // default true if not specified
        description: fieldDef.description ?? '',
        ...(fieldDef.enum !== undefined && { enum: fieldDef.enum }),
        ...(fieldDef.default !== undefined && { default: fieldDef.default }),
        ...(fieldDef.item_type !== undefined && { item_type: fieldDef.item_type }),
      };
    }

    const errors = Object.keys(opDef.errors ?? {});

    operations[opName] = {
      name: opName,
      category: opDef.category,
      description: (opDef.description ?? '').trim(),
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
