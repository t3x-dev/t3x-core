# API Snapshot: @t3x-dev/yops

This file is generated from `dist/index.d.ts`. Run `pnpm api-extract -r --local` to update it.

```ts
import { z } from 'zod';

interface FieldSpec {
    type: string;
    required: boolean;
    status: StabilityStatus;
    description: string;
    enum?: string[];
    default?: unknown;
    item_type?: string;
    deprecated_in?: string;
    replacement_field?: string;
}
interface TestCase {
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
interface PathFields {
    primary?: string;
    source?: string;
    destination?: string;
}
interface OpSpec {
    name: string;
    category: string;
    status: StabilityStatus;
    description: string;
    path_fields: PathFields;
    fields: Record<string, FieldSpec>;
    errors: string[];
    rules: string[];
    tests: TestCase[];
}
interface YOpsSpec {
    name: string;
    version: string;
    description: string;
    operations: Record<string, OpSpec>;
    errors: Record<string, {
        description: string;
    }>;
    execution: {
        order: string;
        on_error: string;
        immutable_input: boolean;
        idempotent_ops: string[];
        strict_ops: string[];
        readonly_ops: string[];
    };
}
type StabilityStatus = (typeof STABILITY_STATUSES)[number];
declare const STABILITY_STATUSES: readonly ["frozen", "evolving", "experimental"];
declare function parseSpec(yamlStr: string): YOpsSpec;

/**
 * @yops-dev/core — Type Definitions
 *
 * YValue: JSON-compatible YAML value in the YOPS Document Model
 * YOp: discriminated union of all 18 operations
 * YOpsResult/YOpsError: execution result types
 */
type YValue = string | number | boolean | null | YValue[] | {
    [key: string]: YValue;
};
type YDocument = YValue;
interface DefineOp {
    path: string;
}
interface DropOp {
    path: string;
}
interface RenameOp {
    path: string;
    to: string;
}
interface SetOp {
    path: string;
    value: YValue;
}
interface UnsetOp {
    path: string;
}
interface PopulateOp {
    path: string;
    values: {
        [key: string]: YValue;
    };
}
interface AppendOp {
    path: string;
    value: YValue;
}
interface MoveOp {
    from: string;
    to: string;
}
interface CloneOp {
    from: string;
    to: string;
}
interface NestOp {
    path: string;
    keys: string[];
    under: string;
}
interface SplitOp {
    path: string;
    into: {
        [group: string]: string[];
    };
}
interface FoldOp {
    path: string;
}
interface MergeOp {
    path: string;
    keys: string[];
    into: string;
}
interface SortOp {
    path: string;
    by?: string;
    order?: 'asc' | 'desc';
}
interface UniqueOp {
    path: string;
    by?: string;
}
interface PickOp {
    path: string;
    keys: string[];
}
interface OmitOp {
    path: string;
    keys: string[];
}
interface AssertOp {
    path: string;
    equals?: YValue;
    exists?: boolean;
    type?: 'mapping' | 'sequence' | 'scalar';
}
type YOp = {
    define: DefineOp;
} | {
    drop: DropOp;
} | {
    rename: RenameOp;
} | {
    set: SetOp;
} | {
    unset: UnsetOp;
} | {
    populate: PopulateOp;
} | {
    append: AppendOp;
} | {
    move: MoveOp;
} | {
    clone: CloneOp;
} | {
    nest: NestOp;
} | {
    split: SplitOp;
} | {
    fold: FoldOp;
} | {
    merge: MergeOp;
} | {
    sort: SortOp;
} | {
    unique: UniqueOp;
} | {
    pick: PickOp;
} | {
    omit: OmitOp;
} | {
    assert: AssertOp;
};
interface YOpsError {
    code: string;
    message: string;
    op_index: number;
}
interface YOpsWarning {
    code: 'DEPRECATED_FIELD';
    message: string;
    op_index: number;
    op: string;
    field: string;
    deprecated_in: string;
    replacement_field?: string;
}
interface YOpsResult {
    ok: boolean;
    doc: YValue;
    applied: number;
    error?: YOpsError;
    warnings?: YOpsWarning[];
}

/**
 * Deterministic, language-portable equality keys and ordering for YValue.
 *
 * - Strings compare by Unicode codepoint, not UTF-16 code unit. JS's
 *   default `<`/`>` and `Array.prototype.sort` compare code units, which
 *   diverges for non-BMP characters (a surrogate pair's high surrogate
 *   is in U+D800..U+DFFF, below BMP private-use chars at U+E000+, even
 *   though the codepoint it represents is U+10000+). A spec that claims
 *   portable order must compare codepoints directly.
 *
 * - `canonicalKey` encodes a value as a string by recursively sorting
 *   mapping keys by codepoint and emitting JSON-style scalars. Two
 *   YValues are equal iff their canonical encodings are equal — this
 *   gives `unique` a portable equivalence relation that does not depend
 *   on insertion order, runtime, or YAML loader.
 */

/**
 * Compare two strings by Unicode codepoint.
 *
 * Iterating a string with `for…of` (or `Symbol.iterator`) yields one
 * "character" per codepoint, automatically pairing surrogates. Each
 * yielded chunk is a 1- or 2-char string whose codepoint we read with
 * `codePointAt(0)`. We compare codepoints numerically; on a tie we
 * advance both iterators.
 */
declare function compareCodepoints(a: string, b: string): number;
declare function canonicalKey(value: YValue): string;
/**
 * Audit-facing canonical JSON serialization for YOPS document-model values.
 *
 * This intentionally reuses the same codepoint-ordered mapping rule as
 * `canonicalKey`, so equality/order helpers and audit serialization agree.
 * It is a YOPS canonical form; do not label it RFC 8785/JCS unless the spec
 * and tests explicitly adopt that external algorithm.
 */
declare function canonicalJson(value: YValue): string;
declare function compareYValues(a: YValue, b: YValue): number;

/**
 * @yops-dev/core — Op Category Classification
 *
 * Classifies a YOp into one of four categories using the spec.
 * Initialized via initClassify() at bootstrap; falls back to 'dtl'.
 *
 * Op-key resolution is shared with the engine via `opShape.resolveOpName`
 * so a `source`-first op like `{ source, set: ... }` classifies as DML
 * (the engine applies it as `set`), not as DTL via the `source` literal.
 */

type YOpCategory = 'ddl' | 'dml' | 'dtl' | 'dcl';
declare function classifyYOp(op: YOp): YOpCategory;

/**
 * @yops-dev/core — OpRegistry
 *
 * Maps op names to handler functions, validated against a YOpsSpec.
 * Ensures every op defined in the spec has a registered handler before
 * the engine is allowed to run.
 */

type OpResult = {
    doc: YValue;
    error?: YOpsError;
};
type OpHandler = (doc: YValue, fields: Record<string, unknown>, index: number) => OpResult;
declare class OpRegistry {
    readonly spec: YOpsSpec;
    private handlers;
    constructor(spec: YOpsSpec);
    /**
     * Register a handler for a spec-defined op.
     * Throws if opName is not present in spec.operations.
     */
    register(opName: string, handler: OpHandler): void;
    /**
     * Validate that every op in the spec has a registered handler.
     * Throws with the names of any missing ops.
     */
    validate(): void;
    /**
     * Retrieve the registered handler for an op, or undefined if not registered.
     */
    getHandler(opName: string): OpHandler | undefined;
    /**
     * Retrieve the OpSpec for an op, or undefined if not in the spec.
     */
    getOpSpec(opName: string): OpSpec | undefined;
    /**
     * Retrieve the path-field metadata for an op, or `undefined` if the op
     * isn't in the spec. Returns an empty object `{}` for an op that has
     * no path fields declared (e.g. an op the spec considers a future
     * extension that doesn't operate on paths).
     *
     * Consumers walking an op list to reason about which paths exist
     * (extractor compilers, replay engines, validators) should use this
     * instead of pattern-matching the op shape — a 19th op added later
     * works automatically as long as it declares `path_fields:` in
     * `yops.yaml`.
     */
    getPathFields(opName: string): PathFields | undefined;
    /**
     * Extract every path string the given op carries, tagged by role.
     *
     * `op` is the runtime op object (e.g. `{ move: { from: 'a', to: 'b' } }`
     * or `{ move: { from: 'a', to: 'b' }, source: { ... } }`). The function
     * resolves the inner payload, then reads each declared path field. Roles
     * line up with `PathFields`:
     *
     *   - `primary`     — the path the op operates on.
     *   - `source`      — read-from path; must exist at apply time.
     *   - `destination` — write-to path; must NOT exist at apply time.
     *
     * Returns an empty array if the op key isn't recognised, the inner
     * payload isn't a mapping, or none of the declared fields contain a
     * non-empty string. Non-string values are silently skipped (the engine
     * boundary already rejects malformed payloads).
     *
     * Op-key resolution uses the same `resolveOpName` semantics as the
     * engine: skip known metadata keys (`source`), then take the first
     * remaining key. If that key isn't a registered op (e.g. a typo, or a
     * future op this engine version doesn't know), return `[]` — never
     * fall through to a later key. Falling through would let
     * `{ frobnicate: {…}, set: { path: 'a' } }` extract \`a\` here while
     * the engine rejects the same op as UNKNOWN_OP, reintroducing the
     * exact op-key-drift class fixed for `source` ordering in #926.
     */
    getOpPaths(op: Record<string, unknown>): Array<{
        role: keyof PathFields;
        path: string;
    }>;
    /**
     * All op names defined in the spec (order: Object.keys).
     */
    get operationNames(): string[];
}

/**
 * @yops-dev/core — Spec-Driven Engine
 *
 * Factory that creates an engine from an OpRegistry.
 * Dispatches ops via registry lookup with field validation.
 * Deep clones input so the original is never mutated.
 * Fail-fast: stops at the first error and returns partial state.
 */

declare function createEngine(registry: OpRegistry): {
    applyYOps: (doc: YValue, ops: YOp[]) => YOpsResult;
};

/**
 * @yops-dev/core — Error Codes
 */
declare const YOPS_ERRORS: {
    readonly PATH_NOT_FOUND: "PATH_NOT_FOUND";
    readonly ALREADY_EXISTS: "ALREADY_EXISTS";
    readonly NOT_A_MAPPING: "NOT_A_MAPPING";
    readonly NOT_A_SEQUENCE: "NOT_A_SEQUENCE";
    readonly NOT_SIBLINGS: "NOT_SIBLINGS";
    readonly NOT_FOLDABLE: "NOT_FOLDABLE";
    readonly INVALID_PATH: "INVALID_PATH";
    readonly ASSERTION_FAILED: "ASSERTION_FAILED";
    readonly UNKNOWN_OP: "UNKNOWN_OP";
    readonly INVALID_OP: "INVALID_OP";
};
type YOpsErrorCode = (typeof YOPS_ERRORS)[keyof typeof YOPS_ERRORS];

/**
 * @yops-dev/core — YAML Parse / Serialize
 *
 * parseYOpsYaml: string → YOp[]
 * formatYOps:    YOp[] → string
 *
 * The spec's normative root is `{ yops: [...] }`. The parser also accepts
 * a bare YAML array for ergonomics and backwards compatibility; the
 * serializer always emits the keyed form.
 */

interface ParseOk {
    ok: true;
    ops: YOp[];
}
interface ParseError {
    ok: false;
    error: string;
}
type ParseResult = ParseOk | ParseError;
declare function parseYOpsYaml(yamlStr: string): ParseResult;
declare function formatYOps(ops: YOp[]): string;

declare function registerAllHandlers(registry: OpRegistry): void;

/**
 * @yops-dev/core — Path Parser
 *
 * Addresses any node in a YAML document using a slash-separated path string.
 *
 * Segment types:
 *   key   — mapping key: `config/database/host`
 *   index — array index: `items/[0]`
 *   match — array key match: `users/[name=alice]/role`
 *
 * Quoted-segment escape (proposal A′ from #930): a segment that starts
 * with `"` is read as a quoted key. Inside the quotes, `\"` is a literal
 * double quote and `\\` is a literal backslash; every other character
 * (including `/`, `[`, `]`, `=`) is itself. This lets paths address keys
 * that contain reserved characters without forking the wire format —
 * `config/"db/prod"/host` resolves to the key `db/prod` under `config`.
 */

type PathSegment = {
    type: 'key';
    value: string;
} | {
    type: 'index';
    value: number;
} | {
    type: 'match';
    key: string;
    value: string;
};
/**
 * Result type for the strict parser. Used by the validator (which surfaces
 * `YOPS_PATH_UNCLOSED_QUOTE` and `YOPS_PATH_INVALID_ESCAPE` diagnostics)
 * when callers need to know about parse-level errors. `parsePath` itself
 * stays permissive — it's used by handlers that already accept whatever
 * shape the user gave them.
 */
type ParsePathResult = {
    ok: true;
    segments: PathSegment[];
} | {
    ok: false;
    code: 'UNCLOSED_QUOTE' | 'INVALID_ESCAPE';
    message: string;
    offset: number;
};
/**
 * Strict parse: returns segments on success or a typed error on quoted-segment
 * malformation. Existing callers should keep using `parsePath` (which is
 * permissive); this is the entry point the validator builds on.
 */
declare function tryParsePath(path: string): ParsePathResult;
/**
 * Parse a path string into an array of PathSegments.
 *
 * Permissive: invalid quoted-segment shapes fall back to the legacy
 * `path.split('/')` behaviour so existing callers see no change for any
 * path that doesn't use the new escape syntax. Callers that need to
 * detect parse errors (the validator) should use `tryParsePath` instead.
 */
declare function parsePath(path: string): PathSegment[];
/**
 * Navigate a document to find the value at the given path.
 * Returns undefined if any segment cannot be followed.
 */
declare function resolvePath(doc: YValue, path: string): YValue | undefined;

/**
 * @yops-dev/core — Zod Schema Validation
 *
 * Provides Zod schemas for all 18 YOp types and a validateOps() helper.
 */

declare const YOpSchema: z.ZodUnion<readonly [z.ZodObject<{
    define: z.ZodObject<{
        path: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    drop: z.ZodObject<{
        path: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    rename: z.ZodObject<{
        path: z.ZodString;
        to: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    set: z.ZodObject<{
        path: z.ZodString;
        value: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    unset: z.ZodObject<{
        path: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    populate: z.ZodObject<{
        path: z.ZodString;
        values: z.ZodRecord<z.ZodString, z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    append: z.ZodObject<{
        path: z.ZodString;
        value: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    move: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    clone: z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    nest: z.ZodObject<{
        path: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
        under: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    split: z.ZodObject<{
        path: z.ZodString;
        into: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString>>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    fold: z.ZodObject<{
        path: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    merge: z.ZodObject<{
        path: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
        into: z.ZodString;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    sort: z.ZodObject<{
        path: z.ZodString;
        by: z.ZodOptional<z.ZodString>;
        order: z.ZodOptional<z.ZodEnum<{
            asc: "asc";
            desc: "desc";
        }>>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    unique: z.ZodObject<{
        path: z.ZodString;
        by: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    pick: z.ZodObject<{
        path: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    omit: z.ZodObject<{
        path: z.ZodString;
        keys: z.ZodArray<z.ZodString>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>, z.ZodObject<{
    assert: z.ZodObject<{
        path: z.ZodString;
        equals: z.ZodOptional<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
        exists: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodOptional<z.ZodEnum<{
            mapping: "mapping";
            sequence: "sequence";
            scalar: "scalar";
        }>>;
    }, z.core.$strict>;
    source: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"llm">;
        model: z.ZodOptional<z.ZodString>;
        at: z.ZodOptional<z.ZodPipe<z.ZodTransform<unknown, unknown>, z.ZodString>>;
        turn_ref: z.ZodObject<{
            turn_hash: z.ZodString;
            quote: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"human">;
        author: z.ZodString;
        surface: z.ZodOptional<z.ZodEnum<{
            tree: "tree";
            script: "script";
            inline: "inline";
        }>>;
    }, z.core.$strip>], "type">>;
}, z.core.$strict>]>;
interface ValidationResult {
    valid: boolean;
    errors?: Array<{
        message: string;
        op_index: number;
    }>;
}
declare function validateOps(ops: unknown[]): ValidationResult;

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
/**
 * A single validator finding. Stable shape: field names baked into UI
 * quick-fix logic, so changes here are breaking.
 */
interface YOpsDiagnostic {
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
    source_span: {
        line: number;
        column: number;
    } | null;
}
/**
 * Stable diagnostic codes. Adding new codes is non-breaking; removing
 * or renaming requires a major version bump on `@t3x-dev/yops`. Each
 * code's meaning is documented in `yops.yaml` under `diagnostic_codes:`.
 */
declare const YOPS_DIAGNOSTIC_CODES: {
    readonly YOPS_INVALID_YAML: "YOPS_INVALID_YAML";
    readonly YOPS_YAML_PROFILE_UNSUPPORTED: "YOPS_YAML_PROFILE_UNSUPPORTED";
    readonly YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY: "YOPS_DOCUMENT_NOT_MAPPING_OR_ARRAY";
    readonly YOPS_DOCUMENT_YOPS_NOT_ARRAY: "YOPS_DOCUMENT_YOPS_NOT_ARRAY";
    readonly YOPS_OP_NOT_MAPPING: "YOPS_OP_NOT_MAPPING";
    readonly YOPS_OP_NO_KEY: "YOPS_OP_NO_KEY";
    readonly YOPS_OP_UNKNOWN: "YOPS_OP_UNKNOWN";
    readonly YOPS_OP_PAYLOAD_NOT_MAPPING: "YOPS_OP_PAYLOAD_NOT_MAPPING";
    readonly YOPS_OP_FIELD_MISSING: "YOPS_OP_FIELD_MISSING";
    readonly YOPS_OP_FIELD_UNKNOWN: "YOPS_OP_FIELD_UNKNOWN";
    readonly YOPS_OP_FIELD_TYPE_MISMATCH: "YOPS_OP_FIELD_TYPE_MISMATCH";
    readonly YOPS_OP_ENUM_VIOLATION: "YOPS_OP_ENUM_VIOLATION";
    readonly YOPS_OP_REFINEMENT_VIOLATION: "YOPS_OP_REFINEMENT_VIOLATION";
    readonly YOPS_PATH_EMPTY: "YOPS_PATH_EMPTY";
    readonly YOPS_PATH_UNCLOSED_QUOTE: "YOPS_PATH_UNCLOSED_QUOTE";
    readonly YOPS_PATH_INVALID_ESCAPE: "YOPS_PATH_INVALID_ESCAPE";
    readonly YOPS_PATH_INVALID_INDEX_SYNTAX: "YOPS_PATH_INVALID_INDEX_SYNTAX";
    readonly YOPS_PATH_INVALID_MATCH_SYNTAX: "YOPS_PATH_INVALID_MATCH_SYNTAX";
    readonly YOPS_PATH_LIKELY_DOUBLE_ESCAPED: "YOPS_PATH_LIKELY_DOUBLE_ESCAPED";
};
type YOpsDiagnosticCode = (typeof YOPS_DIAGNOSTIC_CODES)[keyof typeof YOPS_DIAGNOSTIC_CODES];
/**
 * Validate a parsed YOps op list. Returns a list of diagnostics; never
 * throws, never auto-fixes. Use this when you already have the array
 * (no YAML round-trip).
 */
declare function validateYOpsOps(ops: unknown[]): YOpsDiagnostic[];
/**
 * Validate a YAML string holding a YOps document. Accepts both the
 * normative `{ yops: [...] }` form and a bare array.
 */
declare function validateYOpsYaml(yamlStr: string): YOpsDiagnostic[];

/** Apply YOps operations to a document. */
declare const applyYOps: (doc: YValue, ops: YOp[]) => YOpsResult;
/** The parsed YOps specification. */
declare const spec: YOpsSpec;
/** The initialized op registry. */
declare const registry: OpRegistry;

export { type AppendOp, type AssertOp, type CloneOp, type DefineOp, type DropOp, type FieldSpec, type FoldOp, type MergeOp, type MoveOp, type NestOp, type OmitOp, type OpHandler, OpRegistry, type OpResult, type OpSpec, type ParsePathResult, type ParseResult, type PathFields, type PathSegment, type PickOp, type PopulateOp, type RenameOp, type SetOp, type SortOp, type SplitOp, type StabilityStatus, type TestCase, type UniqueOp, type UnsetOp, type ValidationResult, type YDocument, YOPS_DIAGNOSTIC_CODES, YOPS_ERRORS, type YOp, type YOpCategory, YOpSchema, type YOpsDiagnostic, type YOpsDiagnosticCode, type YOpsError, type YOpsErrorCode, type YOpsResult, type YOpsSpec, type YOpsWarning, type YValue, applyYOps, canonicalJson, canonicalKey, classifyYOp, compareCodepoints, compareYValues, createEngine, formatYOps, parsePath, parseSpec, parseYOpsYaml, registerAllHandlers, registry, resolvePath, spec, tryParsePath, validateOps, validateYOpsOps, validateYOpsYaml };
```
