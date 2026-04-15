/**
 * @yops-dev/core — OpRegistry
 *
 * Maps op names to handler functions, validated against a YOpsSpec.
 * Ensures every op defined in the spec has a registered handler before
 * the engine is allowed to run.
 */

import type { OpSpec, YOpsSpec } from './spec';
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
   * All op names defined in the spec (order: Object.keys).
   */
  get operationNames(): string[] {
    return Object.keys(this.spec.operations);
  }
}
