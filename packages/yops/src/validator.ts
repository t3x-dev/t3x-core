/**
 * @yops-dev/core — YOps document validator
 *
 * Pre-flight validation surface for YOps documents and op lists. Returns
 * a list of diagnostics; never throws, never auto-fixes. Stable diagnostic
 * codes are documented in `yops.yaml` under `diagnostic_codes:` and
 * mirrored here as exported constants.
 *
 * Two entry points:
 *
 *   - `validateYOpsYaml(yaml: string)` — parses YAML, unwraps the
 *     `{ yops: [...] }` envelope (or accepts a bare array), then
 *     delegates to `validateYOpsOps`.
 *
 *   - `validateYOpsOps(ops: unknown[])` — validates an already-parsed
 *     op list. Used by callers that don't pay a YAML round-trip
 *     (API, MCP, CLI, the WebUI when it has the parsed object on hand).
 *
 * Both return `YOpsDiagnostic[]`. Empty array means the document passes
 * pre-flight; presence of any diagnostic with `severity: 'error'` means
 * apply should not proceed without consumer-level intervention.
 *
 * Out of scope for this surface (deferred to follow-up PRs / consumers):
 *
 *   - Dry-run preflight against a current document (lives in
 *     `@t3x-dev/core` because it needs the engine).
 *   - `source_span` population (reserved in the type, returns null in
 *     this version; needs a position-aware YAML reader).
 *   - Auto-apply of `suggestion` text (consumers' UI decision).
 */

import { isMappingObject, OP_METADATA_KEYS, resolveOpName } from './opShape';
import { tryParsePath } from './paths';
import { parseSpec, type YOpsSpec } from './spec';
import { SPEC_YAML } from './specData';
import { parseYamlDeclaration, YOPS_YAML_PROFILE_UNSUPPORTED } from './yamlProfile';

// ── Diagnostic shape ─────────────────────────────────────────────────────

/**
 * A single validator finding. Stable shape: field names baked into UI
 * quick-fix logic, so changes here are breaking.
 */
export interface YOpsDiagnostic {
  severity: 'error' | 'warning' | 'info';
  /** Stable code from `yops.yaml` `diagnostic_codes:`. See {@link YOPS_DIAGNOSTIC_CODES}. */
  code: string;
  message: string;
  /** Index into the op list, or `null` for envelope/document-level findings. */
  op_index: number | null;
  /**
   * Dotted path naming the field this diagnostic concerns. Always uses
   * a documented root: `document.*` for envelope-level fields,
   * `<op_name>.*` for op-level fields. UI tooling pattern-matches on
   * this; never invent your own format.
   */
  field: string | null;
  /** The offending path string, if relevant. */
  path: string | null;
  /** Human-readable quick-fix hint. Never auto-applied. */
  suggestion: string | null;
  /**
   * Reserved for editor red-lines. Always `null` in this version of
   * the validator; populated in a later PR by a position-aware YAML
   * reader.
   */
  source_span: { line: number; column: number } | null;
}

// ── Stable code constants ────────────────────────────────────────────────

/**
 * Stable diagnostic codes. Adding new codes is non-breaking; removing
 * or renaming requires a major version bump on `@t3x-dev/yops`. Each
 * code's meaning is documented in `yops.yaml` under `diagnostic_codes:`.
 */
export const YOPS_DIAGNOSTIC_CODES = {
  // Document / envelope (op_index === null)
  YOPS_INVALID_YAML: 'YOPS_INVALID_YAML',
  YOPS_YAML_PROFILE_UNSUPPORTED,
  YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY: 'YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY',
  YOPS_DOCUMENT_YOPS_NOT_ARRAY: 'YOPS_DOCUMENT_YOPS_NOT_ARRAY',
  // Op-level
  YOPS_OP_NOT_MAPPING: 'YOPS_OP_NOT_MAPPING',
  YOPS_OP_NO_KEY: 'YOPS_OP_NO_KEY',
  YOPS_OP_UNKNOWN: 'YOPS_OP_UNKNOWN',
  YOPS_OP_PAYLOAD_NOT_MAPPING: 'YOPS_OP_PAYLOAD_NOT_MAPPING',
  YOPS_OP_FIELD_MISSING: 'YOPS_OP_FIELD_MISSING',
  YOPS_OP_FIELD_UNKNOWN: 'YOPS_OP_FIELD_UNKNOWN',
  YOPS_OP_FIELD_TYPE_MISMATCH: 'YOPS_OP_FIELD_TYPE_MISMATCH',
  YOPS_OP_ENUM_VIOLATION: 'YOPS_OP_ENUM_VIOLATION',
  YOPS_OP_REFINEMENT_VIOLATION: 'YOPS_OP_REFINEMENT_VIOLATION',
  // Path syntax
  YOPS_PATH_EMPTY: 'YOPS_PATH_EMPTY',
  YOPS_PATH_UNCLOSED_QUOTE: 'YOPS_PATH_UNCLOSED_QUOTE',
  YOPS_PATH_INVALID_ESCAPE: 'YOPS_PATH_INVALID_ESCAPE',
  YOPS_PATH_INVALID_INDEX_SYNTAX: 'YOPS_PATH_INVALID_INDEX_SYNTAX',
  YOPS_PATH_INVALID_MATCH_SYNTAX: 'YOPS_PATH_INVALID_MATCH_SYNTAX',
  YOPS_PATH_LIKELY_DOUBLE_ESCAPED: 'YOPS_PATH_LIKELY_DOUBLE_ESCAPED',
} as const;

export type YOpsDiagnosticCode = (typeof YOPS_DIAGNOSTIC_CODES)[keyof typeof YOPS_DIAGNOSTIC_CODES];

// ── Helpers ──────────────────────────────────────────────────────────────

function diagnostic(
  severity: YOpsDiagnostic['severity'],
  code: YOpsDiagnosticCode,
  message: string,
  fields: Partial<Pick<YOpsDiagnostic, 'op_index' | 'field' | 'path' | 'suggestion'>> = {}
): YOpsDiagnostic {
  return {
    severity,
    code,
    message,
    op_index: fields.op_index ?? null,
    field: fields.field ?? null,
    path: fields.path ?? null,
    suggestion: fields.suggestion ?? null,
    source_span: null,
  };
}

/**
 * Type-name helper aligned with the spec's `type:` declarations: 'string',
 * 'number', 'boolean', 'mapping', 'sequence', 'any'. The spec field type
 * 'any' matches every concrete value (including null).
 */
function runtimeMatchesSpecType(value: unknown, specType: string): boolean {
  if (specType === 'any') return true;
  if (specType === 'string') return typeof value === 'string';
  if (specType === 'number') return typeof value === 'number';
  if (specType === 'boolean') return typeof value === 'boolean';
  if (specType === 'mapping') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (specType === 'sequence') return Array.isArray(value);
  // Unknown spec type — be permissive rather than fail closed; the spec
  // itself is wrong if this hits.
  return true;
}

function describeRuntimeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'sequence';
  return typeof value;
}

// ── Path validation ──────────────────────────────────────────────────────

/**
 * Op + field combinations that accept the empty path (root) at apply
 * time. Mirrors `RootablePathSchema = z.string()` (no `.min(1)`) in
 * `schema.ts`, vs the default `PathSchema = z.string().min(1)` used by
 * every other path field. Re-implementations should keep these in
 * sync; the engine accepts a root path on these ops because the
 * operation logically targets the document root (`pick: { path: '' }`
 * keeps top-level keys, etc.).
 *
 * If you change this list, also update `schema.ts` and the engine
 * handlers, then re-run the validator-engine alignment property test.
 */
const ROOTABLE_PATH_FIELDS: Record<string, Set<string>> = {
  nest: new Set(['path']),
  split: new Set(['path']),
  merge: new Set(['path']),
  pick: new Set(['path']),
  omit: new Set(['path']),
};

function isRootablePathField(opName: string, fieldName: string): boolean {
  return ROOTABLE_PATH_FIELDS[opName]?.has(fieldName) ?? false;
}

/**
 * Run path-syntax checks on a single path string. Used by the op-level
 * walker for every field whose value the spec marks as a path (per
 * `path_fields:` metadata).
 */
function validatePath(
  path: unknown,
  ctx: { op_index: number; field: string; rootable: boolean }
): YOpsDiagnostic[] {
  // The op-level walker already checks field type before calling us; if
  // we somehow get a non-string, emit nothing — the upstream
  // YOPS_OP_FIELD_TYPE_MISMATCH covers it.
  if (typeof path !== 'string') return [];

  const out: YOpsDiagnostic[] = [];

  if (path.length === 0) {
    if (ctx.rootable) {
      // Rootable path field accepts empty as "the document root".
      // Schema permits, engine applies — validator must not flag.
      return out;
    }
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_PATH_EMPTY,
        `Path string is empty (zero-length input)`,
        { op_index: ctx.op_index, field: ctx.field, path }
      )
    );
    return out;
  }

  const parsed = tryParsePath(path);
  if (!parsed.ok) {
    if (parsed.code === 'UNCLOSED_QUOTE') {
      out.push(
        diagnostic('error', YOPS_DIAGNOSTIC_CODES.YOPS_PATH_UNCLOSED_QUOTE, parsed.message, {
          op_index: ctx.op_index,
          field: ctx.field,
          path,
        })
      );
    } else {
      out.push(
        diagnostic('error', YOPS_DIAGNOSTIC_CODES.YOPS_PATH_INVALID_ESCAPE, parsed.message, {
          op_index: ctx.op_index,
          field: ctx.field,
          path,
        })
      );
    }
    return out;
  }

  // Per-segment checks. We re-walk the raw string because parsePath has
  // already absorbed quoting decisions; for these heuristics we want to
  // know "did this segment use quoting or not?", which needs the raw text.
  //
  // Note: we deliberately do NOT impose a key-format grammar (no
  // SNAKE_CASE_KEY rule). The runtime parser and engine accept any
  // non-empty string as a plain key — including hyphens, dots, and
  // whitespace — and there are explicit edge-case tests covering keys
  // like `my-config.v2` and `my key`. Validator findings must not
  // reject inputs the engine would happily apply.
  const rawSegments = splitRawSegments(path);
  for (const raw of rawSegments) {
    if (raw.startsWith('"')) {
      // Quoted — content already validated by tryParsePath above.
      continue;
    }
    if (raw.startsWith('[')) {
      // Bracket segment. Either index `[N]` or match `[k=v]`.
      const isIndex = /^\[(\d+)\]$/.test(raw);
      const isMatch = /^\[([^=\]]+)=([^\]]*)\]$/.test(raw);
      if (!isIndex && !isMatch) {
        const code = raw.includes('=')
          ? YOPS_DIAGNOSTIC_CODES.YOPS_PATH_INVALID_MATCH_SYNTAX
          : YOPS_DIAGNOSTIC_CODES.YOPS_PATH_INVALID_INDEX_SYNTAX;
        out.push(
          diagnostic('error', code, `Malformed bracket segment "${raw}" in path "${path}"`, {
            op_index: ctx.op_index,
            field: ctx.field,
            path,
          })
        );
      }
      continue;
    }
    // Plain key segment outside any quoted region — emit the
    // double-escape advisory if it contains `\"`. Inside a quoted
    // segment `\"` is the documented escape for a literal `"` and
    // must not trigger the heuristic. Per-segment placement keeps the
    // signal aligned with intent: only out-of-quote `\"` suggests the
    // YAML layer leaked an escape into the YOps layer.
    if (raw.includes('\\"')) {
      out.push(
        diagnostic(
          'info',
          YOPS_DIAGNOSTIC_CODES.YOPS_PATH_LIKELY_DOUBLE_ESCAPED,
          `Path contains \\" patterns outside any quoted segment that may indicate accidental YAML+YOps double-quoting. The validator cannot tell intent from accident — treat as advisory.`,
          {
            op_index: ctx.op_index,
            field: ctx.field,
            path,
            suggestion:
              'If the backslash-quote was meant by your YAML emitter to encode a literal `"`, prefer single-quoted YAML strings or block scalars. If it is a real literal-backslash key, ignore this warning.',
          }
        )
      );
    }
  }

  return out;
}

/**
 * Walk the raw path string, splitting on `/` while respecting quoted
 * segments. Returns the raw text of each segment (quoted segments still
 * include their surrounding quotes). Mirrors the segment boundaries
 * `tryParsePath` uses internally.
 */
function splitRawSegments(path: string): string[] {
  const segments: string[] = [];
  let i = 0;
  let segStart = 0;
  while (i < path.length) {
    if (path[i] === '"') {
      // Skip to closing quote (handling escapes). If unclosed, the
      // entire rest is one segment.
      i++;
      while (i < path.length) {
        if (path[i] === '\\' && i + 1 < path.length) {
          i += 2;
          continue;
        }
        if (path[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (path[i] === '/') {
      segments.push(path.slice(segStart, i));
      i++;
      segStart = i;
      continue;
    }
    i++;
  }
  segments.push(path.slice(segStart));
  return segments;
}

// ── Op walker ────────────────────────────────────────────────────────────

let _lazySpec: YOpsSpec | null = null;
function getSpec(): YOpsSpec {
  if (_lazySpec) return _lazySpec;
  // Parse from the bundled spec string. Avoids an import cycle with
  // `index.ts` (which imports the validator).
  _lazySpec = parseSpec(SPEC_YAML);
  return _lazySpec;
}

function validateOp(op: unknown, op_index: number): YOpsDiagnostic[] {
  const out: YOpsDiagnostic[] = [];

  if (!isMappingObject(op)) {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_NOT_MAPPING,
        `Op at index ${op_index} must be a mapping, got ${describeRuntimeType(op)}`,
        { op_index, field: null }
      )
    );
    return out;
  }

  const opName = resolveOpName(op);
  if (opName === null) {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_NO_KEY,
        `Op at index ${op_index} has no operation key (only metadata keys: ${[...OP_METADATA_KEYS].join(', ')})`,
        { op_index, field: null }
      )
    );
    return out;
  }

  // Outer-level unknown keys. The schema applies `.strict()` to the
  // outer op object, so anything other than the resolved op name and
  // declared metadata keys (`source`) is a rejection at apply time.
  // Without this, `{ set: { … }, extra: true }` slips through the
  // validator while the engine refuses it.
  for (const key of Object.keys(op)) {
    if (key === opName) continue;
    if (OP_METADATA_KEYS.has(key)) continue;
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_FIELD_UNKNOWN,
        `${opName}: unexpected outer-level key "${key}" (only the op name and metadata keys [${[...OP_METADATA_KEYS].join(', ')}] are allowed)`,
        { op_index, field: null }
      )
    );
  }

  // Source metadata, if present, must satisfy `SourceSchema` (a
  // discriminated union on `type`). Apply-time rejects malformed
  // sources (e.g. `{ source: { type: 'human', author: '' } }`); the
  // validator must too.
  if ('source' in op) {
    out.push(...validateSource(op.source, op_index));
  }

  const opSpec = getSpec().operations[opName];
  if (!opSpec) {
    out.push(
      diagnostic('error', YOPS_DIAGNOSTIC_CODES.YOPS_OP_UNKNOWN, `Unknown operation: ${opName}`, {
        op_index,
        field: `${opName}`,
      })
    );
    return out;
  }

  const payload = op[opName];
  if (!isMappingObject(payload)) {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_PAYLOAD_NOT_MAPPING,
        `${opName}: payload must be a mapping, got ${describeRuntimeType(payload)}`,
        { op_index, field: opName }
      )
    );
    return out;
  }

  // Required fields present
  for (const [fieldName, fieldSpec] of Object.entries(opSpec.fields)) {
    if (fieldSpec.required && !(fieldName in payload)) {
      out.push(
        diagnostic(
          'error',
          YOPS_DIAGNOSTIC_CODES.YOPS_OP_FIELD_MISSING,
          `${opName}: required field "${fieldName}" is missing`,
          { op_index, field: `${opName}.${fieldName}` }
        )
      );
    }
  }

  // No unknown fields
  for (const fieldName of Object.keys(payload)) {
    if (!(fieldName in opSpec.fields)) {
      out.push(
        diagnostic(
          'error',
          YOPS_DIAGNOSTIC_CODES.YOPS_OP_FIELD_UNKNOWN,
          `${opName}: unknown field "${fieldName}"`,
          { op_index, field: `${opName}.${fieldName}` }
        )
      );
    }
  }

  // Per-field type / enum / path checks
  for (const [fieldName, fieldSpec] of Object.entries(opSpec.fields)) {
    if (!(fieldName in payload)) continue;
    const value = payload[fieldName];

    if (!runtimeMatchesSpecType(value, fieldSpec.type)) {
      out.push(
        diagnostic(
          'error',
          YOPS_DIAGNOSTIC_CODES.YOPS_OP_FIELD_TYPE_MISMATCH,
          `${opName}: field "${fieldName}" expected ${fieldSpec.type}, got ${describeRuntimeType(value)}`,
          { op_index, field: `${opName}.${fieldName}` }
        )
      );
      continue;
    }

    if (fieldSpec.enum && typeof value === 'string' && !fieldSpec.enum.includes(value)) {
      out.push(
        diagnostic(
          'error',
          YOPS_DIAGNOSTIC_CODES.YOPS_OP_ENUM_VIOLATION,
          `${opName}: field "${fieldName}" must be one of [${fieldSpec.enum.join(', ')}], got "${value}"`,
          { op_index, field: `${opName}.${fieldName}` }
        )
      );
      continue;
    }

    // Path-shaped field? Run path syntax checks.
    const pathFields = opSpec.path_fields ?? {};
    const isPathField = Object.values(pathFields).includes(fieldName);
    if (isPathField) {
      out.push(
        ...validatePath(value, {
          op_index,
          field: `${opName}.${fieldName}`,
          rootable: isRootablePathField(opName, fieldName),
        })
      );
    }
  }

  // Op-specific cross-field refinements that the spec-level checks above
  // don't capture. Each refinement mirrors a `.refine(...)` clause in
  // `schema.ts` so the validator and the runtime engine agree on which
  // payloads are well-formed. Without this, callers using the validator
  // as a preflight gate would still hit `INVALID_OP` at apply time.
  out.push(...validateOpRefinements(opName, payload, op_index));

  return out;
}

/**
 * Cross-field and string-length refinements that go beyond per-field
 * type / required / enum checks. Each entry mirrors a `.refine(...)` or
 * `.min(...)` clause in `schema.ts` so validator and runtime engine
 * agree on which payloads are well-formed.
 *
 * Two kinds covered today:
 *
 *   1. Cross-field rules — e.g. `assert` must declare at least one of
 *      `equals` / `exists` / `type`.
 *   2. Required non-path strings that must be non-empty. Spec marks
 *      these fields as `type: string`, `required: true`; the schema
 *      adds an implicit `.min(1)`. Path fields are handled separately
 *      (see `YOPS_PATH_EMPTY` and `ROOTABLE_PATH_FIELDS`); the names
 *      below are deliberately the *non-path* string fields.
 *
 * Re-implementations should keep these aligned with `schema.ts`. If a
 * new rule is added to the schema, also extend the bundle here and add
 * a fixture to `__tests__/validator-engine-alignment.test.ts`.
 */
const NON_EMPTY_STRING_FIELDS: Record<string, Set<string>> = {
  rename: new Set(['to']),
  nest: new Set(['under']),
  merge: new Set(['into']),
};

/**
 * Sequence fields whose elements must be strings. Mirrors
 * `z.array(z.string())` clauses in `schema.ts` for `nest.keys`,
 * `merge.keys`, `pick.keys`, `omit.keys`, and the inner arrays of
 * `split.into`. Spec-level type check only verifies `Array.isArray`,
 * so without this the validator would accept `{ pick: { keys: [1] } }`
 * while the engine rejects.
 */
const STRING_ARRAY_FIELDS: Record<string, Set<string>> = {
  nest: new Set(['keys']),
  merge: new Set(['keys']),
  pick: new Set(['keys']),
  omit: new Set(['keys']),
};

/**
 * Source metadata schema mirror. Mirrors `SourceSchema` in `schema.ts`,
 * a discriminated union on `type` ('llm' | 'human') with non-empty
 * string requirements on the inner fields. Engine and validator must
 * agree because handlers may persist these values verbatim.
 */
function validateSource(value: unknown, op_index: number): YOpsDiagnostic[] {
  const out: YOpsDiagnostic[] = [];

  if (!isMappingObject(value)) {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
        `source: must be a mapping, got ${describeRuntimeType(value)}`,
        { op_index, field: null }
      )
    );
    return out;
  }

  const type = value.type;
  if (type !== 'llm' && type !== 'human') {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
        `source.type: must be one of ['llm', 'human'], got ${JSON.stringify(type)}`,
        { op_index, field: null }
      )
    );
    return out;
  }

  if (type === 'human') {
    if (typeof value.author !== 'string' || value.author.length === 0) {
      out.push(
        diagnostic(
          'error',
          YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
          `source.author: must be a non-empty string for human sources`,
          { op_index, field: null }
        )
      );
    }
    return out;
  }

  // type === 'llm'
  const turnRef = value.turn_ref;
  if (!isMappingObject(turnRef)) {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
        `source.turn_ref: must be a mapping with turn_hash and quote for llm sources`,
        { op_index, field: null }
      )
    );
    return out;
  }
  if (typeof turnRef.turn_hash !== 'string' || turnRef.turn_hash.length === 0) {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
        `source.turn_ref.turn_hash: must be a non-empty string`,
        { op_index, field: null }
      )
    );
  }
  if (typeof turnRef.quote !== 'string' || turnRef.quote.length === 0) {
    out.push(
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
        `source.turn_ref.quote: must be a non-empty string`,
        { op_index, field: null }
      )
    );
  }
  return out;
}

function validateOpRefinements(
  opName: string,
  payload: { [key: string]: unknown },
  op_index: number
): YOpsDiagnostic[] {
  const out: YOpsDiagnostic[] = [];

  // Cross-field: `assert` requires at least one condition.
  if (opName === 'assert') {
    const hasCondition =
      payload.equals !== undefined || payload.exists !== undefined || payload.type !== undefined;
    if (!hasCondition) {
      out.push(
        diagnostic(
          'error',
          YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
          `assert: at least one of equals, exists, or type must be provided`,
          { op_index, field: null }
        )
      );
    }
  }

  // String length: required non-path strings reject empty values.
  const nonEmpty = NON_EMPTY_STRING_FIELDS[opName];
  if (nonEmpty) {
    for (const fieldName of nonEmpty) {
      const value = payload[fieldName];
      if (typeof value === 'string' && value.length === 0) {
        out.push(
          diagnostic(
            'error',
            YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
            `${opName}: field "${fieldName}" must be a non-empty string`,
            { op_index, field: `${opName}.${fieldName}` }
          )
        );
      }
    }
  }

  // Array element types: `keys` arrays must contain strings.
  const stringArrays = STRING_ARRAY_FIELDS[opName];
  if (stringArrays) {
    for (const fieldName of stringArrays) {
      const value = payload[fieldName];
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] !== 'string') {
            out.push(
              diagnostic(
                'error',
                YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
                `${opName}: field "${fieldName}[${i}]" must be a string, got ${describeRuntimeType(value[i])}`,
                { op_index, field: `${opName}.${fieldName}` }
              )
            );
          }
        }
      }
    }
  }

  // `split.into` is a mapping whose values are arrays of strings.
  // Spec-level type check verifies `mapping`, but the schema's
  // `z.record(z.string(), z.array(z.string()))` also requires the
  // inner arrays to hold strings.
  if (opName === 'split' && isMappingObject(payload.into)) {
    for (const [groupName, members] of Object.entries(payload.into)) {
      if (!Array.isArray(members)) {
        out.push(
          diagnostic(
            'error',
            YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
            `split: field "into.${groupName}" must be an array of strings, got ${describeRuntimeType(members)}`,
            { op_index, field: `split.into` }
          )
        );
        continue;
      }
      for (let i = 0; i < members.length; i++) {
        if (typeof members[i] !== 'string') {
          out.push(
            diagnostic(
              'error',
              YOPS_DIAGNOSTIC_CODES.YOPS_OP_REFINEMENT_VIOLATION,
              `split: field "into.${groupName}[${i}]" must be a string, got ${describeRuntimeType(members[i])}`,
              { op_index, field: `split.into` }
            )
          );
        }
      }
    }
  }

  return out;
}

// ── Public entry points ──────────────────────────────────────────────────

/**
 * Validate a parsed YOps op list. Returns a list of diagnostics; never
 * throws, never auto-fixes. Use this when you already have the array
 * (no YAML round-trip).
 */
export function validateYOpsOps(ops: unknown[]): YOpsDiagnostic[] {
  if (!Array.isArray(ops)) {
    return [
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY,
        `Expected an array of ops, got ${describeRuntimeType(ops)}`,
        { op_index: null, field: 'document.yops' }
      ),
    ];
  }

  const out: YOpsDiagnostic[] = [];
  for (let i = 0; i < ops.length; i++) {
    out.push(...validateOp(ops[i], i));
  }
  return out;
}

/**
 * Validate a YAML string holding a YOps document. Accepts both the
 * normative `{ yops: [...] }` form and a bare array.
 */
export function validateYOpsYaml(yamlStr: string): YOpsDiagnostic[] {
  const parsed = parseYamlDeclaration(yamlStr);
  if (!parsed.ok) {
    const isProfileViolation = parsed.kind === 'unsupported-profile';
    return [
      diagnostic(
        'error',
        isProfileViolation
          ? YOPS_DIAGNOSTIC_CODES.YOPS_YAML_PROFILE_UNSUPPORTED
          : YOPS_DIAGNOSTIC_CODES.YOPS_INVALID_YAML,
        isProfileViolation ? parsed.error : `YAML parse error: ${parsed.error}`,
        { op_index: null, field: null }
      ),
    ];
  }

  if (Array.isArray(parsed.value)) {
    return validateYOpsOps(parsed.value);
  }

  if (parsed.value === null || typeof parsed.value !== 'object') {
    return [
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY,
        `Top-level YAML value must be a mapping with a 'yops:' key or a bare array, got ${describeRuntimeType(parsed.value)}`,
        { op_index: null, field: null }
      ),
    ];
  }

  const inner = (parsed.value as { yops?: unknown }).yops;
  if (!Array.isArray(inner)) {
    return [
      diagnostic(
        'error',
        YOPS_DIAGNOSTIC_CODES.YOPS_DOCUMENT_YOPS_NOT_ARRAY,
        `Document has a 'yops:' key but its value is not an array (got ${describeRuntimeType(inner)})`,
        { op_index: null, field: 'document.yops' }
      ),
    ];
  }

  return validateYOpsOps(inner);
}
