/**
 * @yops-dev/core — OpRegistry
 *
 * Maps op names to handler functions, validated against a YOpsSpec.
 * Ensures every op defined in the spec has a registered handler before
 * the engine is allowed to run.
 */

import { resolveOpName } from './opShape';
import type { OpSpec, PathFields, YOpsSpec } from './spec';
import type { YOpsError, YValue } from './types';

// ── Public types ──

export type OpResult = { doc: YValue; error?: YOpsError };

export type OpHandler = (doc: YValue, fields: Record<string, unknown>, index: number) => OpResult;

// ── Registry ──

export class OpRegistry {
  readonly spec: YOpsSpec;
  private handlers: Map<string, OpHandler>;

  constructor(spec: YOpsSpec) {
    this.spec = spec;
    this.handlers = new Map();
  }

  /**
   * Register a handler for a spec-defined op.
   * Throws if opName is not present in spec.operations.
   */
  register(opName: string, handler: OpHandler): void {
    if (!(opName in this.spec.operations)) {
      throw new Error(`Cannot register handler for unknown op "${opName}": not defined in spec`);
    }
    this.handlers.set(opName, handler);
  }

  /**
   * Validate that every op in the spec has a registered handler.
   * Throws with the names of any missing ops.
   */
  validate(): void {
    const missing: string[] = [];
    for (const opName of Object.keys(this.spec.operations)) {
      if (!this.handlers.has(opName)) {
        missing.push(opName);
      }
    }
    if (missing.length > 0) {
      throw new Error(`OpRegistry is incomplete — missing handlers for: ${missing.join(', ')}`);
    }
  }

  /**
   * Retrieve the registered handler for an op, or undefined if not registered.
   */
  getHandler(opName: string): OpHandler | undefined {
    return this.handlers.get(opName);
  }

  /**
   * Retrieve the OpSpec for an op, or undefined if not in the spec.
   */
  getOpSpec(opName: string): OpSpec | undefined {
    return this.spec.operations[opName];
  }

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
  getPathFields(opName: string): PathFields | undefined {
    const op = this.spec.operations[opName];
    return op?.path_fields;
  }

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
  getOpPaths(op: Record<string, unknown>): Array<{ role: keyof PathFields; path: string }> {
    const opName = resolveOpName(op);
    if (opName === null) return [];
    const pathFields = this.getPathFields(opName);
    if (!pathFields) return [];
    const inner = op[opName];
    if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) return [];
    const innerMap = inner as Record<string, unknown>;

    const result: Array<{ role: keyof PathFields; path: string }> = [];
    for (const role of ['primary', 'source', 'destination'] as const) {
      const fieldName = pathFields[role];
      if (fieldName === undefined) continue;
      const value = innerMap[fieldName];
      if (typeof value === 'string' && value.length > 0) {
        result.push({ role, path: value });
      }
    }
    return result;
  }

  /**
   * All op names defined in the spec (order: Object.keys).
   */
  get operationNames(): string[] {
    return Object.keys(this.spec.operations);
  }
}
