import {
  applyNativeYOps,
  type NativeYOp,
  NativeYOpSchema,
  type NativeYValue,
  parseNativeYOpsPath,
} from '@t3x-dev/core';
import {
  type NodeSchema,
  normalizeYSchemaObject,
  type RelationTypeSchema,
  type SlotSchema,
  sha256CompositionValue,
  type YSchema,
  type YSchemaRuleSchema,
} from '@t3x-dev/yschema';
import type { SchemaAuthoringDigest } from './types';

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const PATH_RE = /^[a-z][a-z0-9_]*(\/[a-z][a-z0-9_]*)*$/;
const EDITABLE_ROOTS = new Set(['nodes', 'relationTypes', 'rules']);

export type WorkspaceSchemaEditCommand =
  | {
      readonly kind: 'put_node';
      /** Semantic node path, for example `product` or `release/milestones`. */
      readonly nodePath: string;
      readonly definition: NodeSchema;
    }
  | {
      readonly kind: 'remove_node';
      readonly nodePath: string;
    }
  | {
      readonly kind: 'put_slot';
      readonly nodePath: string;
      readonly slot: string;
      readonly definition: SlotSchema;
      /** When present, also updates requiredSlots atomically. */
      readonly required?: boolean;
    }
  | {
      readonly kind: 'remove_slot';
      readonly nodePath: string;
      readonly slot: string;
    }
  | {
      readonly kind: 'put_relation_type';
      readonly relationType: string;
      readonly definition: RelationTypeSchema;
    }
  | {
      readonly kind: 'remove_relation_type';
      readonly relationType: string;
    }
  | {
      readonly kind: 'put_rule';
      readonly rule: YSchemaRuleSchema;
    }
  | {
      readonly kind: 'remove_rule';
      readonly ruleId: string;
    };

export type WorkspaceSchemaYOpsErrorCode =
  | 'INVALID_COMMAND'
  | 'PATH_OUT_OF_BOUNDS'
  | 'INVALID_OPERATION'
  | 'APPLY_FAILED'
  | 'INVALID_RESULT';

export class WorkspaceSchemaYOpsError extends Error {
  readonly code: WorkspaceSchemaYOpsErrorCode;
  readonly operationIndex?: number;

  constructor(code: WorkspaceSchemaYOpsErrorCode, message: string, operationIndex?: number) {
    super(message);
    this.name = 'WorkspaceSchemaYOpsError';
    this.code = code;
    this.operationIndex = operationIndex;
  }
}

export interface AppliedWorkspaceSchemaYOps {
  readonly schema: YSchema;
  readonly schemaHash: SchemaAuthoringDigest;
  readonly operations: readonly NativeYOp[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function commandError(message: string): never {
  throw new WorkspaceSchemaYOpsError('INVALID_COMMAND', message);
}

function assertKey(value: string, label: string): string {
  if (!KEY_RE.test(value)) commandError(`${label} must match ${KEY_RE.source}`);
  return value;
}

function parseNodePath(path: string): string[] {
  if (!PATH_RE.test(path)) commandError(`nodePath must match ${PATH_RE.source}`);
  return path.split('/');
}

function nodeYOpsPath(segments: readonly string[]): string {
  return `nodes/${segments.join('/children/')}`;
}

function findNode(schema: YSchema, segments: readonly string[]): NodeSchema | undefined {
  let node = schema.nodes[segments[0]];
  for (const segment of segments.slice(1)) {
    if (!node || node.children === undefined || node.children === 'any') return undefined;
    node = node.children[segment];
  }
  return node;
}

function requireNode(schema: YSchema, segments: readonly string[]): NodeSchema {
  const node = findNode(schema, segments);
  if (!node) commandError(`Node ${segments.join('/')} does not exist`);
  return node;
}

function assertThenSet(path: string, before: NativeYValue | undefined, after: NativeYValue) {
  return [
    before === undefined
      ? ({ assert: { path, exists: false } } as const)
      : ({ assert: { path, equals: clone(before) } } as const),
    { set: { path, value: clone(after) } } as const,
  ] satisfies NativeYOp[];
}

function assertThenUnset(path: string, before: NativeYValue) {
  return [
    { assert: { path, equals: clone(before) } } as const,
    { unset: { path } } as const,
  ] satisfies NativeYOp[];
}

function asYValue(value: unknown): NativeYValue {
  return clone(value) as NativeYValue;
}

/**
 * Compile task-oriented Schema edits to native YOps with exact preconditions.
 * The commands never mutate their input Schema.
 */
export function compileWorkspaceSchemaEditCommand(
  baseInput: unknown,
  command: WorkspaceSchemaEditCommand
): readonly NativeYOp[] {
  const base = normalizeYSchemaObject(clone(baseInput));

  switch (command.kind) {
    case 'put_node': {
      const segments = parseNodePath(command.nodePath);
      const targetPath = nodeYOpsPath(segments);
      if (segments.length === 1) {
        return assertThenSet(
          targetPath,
          base.nodes[segments[0]] as NativeYValue | undefined,
          asYValue(command.definition)
        );
      }
      const parentSegments = segments.slice(0, -1);
      const parent = requireNode(base, parentSegments);
      if (parent.children === 'any') {
        commandError(
          `Node ${parentSegments.join('/')} has open children and cannot own definitions`
        );
      }
      if (parent.children === undefined) {
        return assertThenSet(
          nodeYOpsPath(parentSegments),
          asYValue(parent),
          asYValue({
            ...clone(parent),
            children: { [segments.at(-1)!]: clone(command.definition) },
          })
        );
      }
      return assertThenSet(
        targetPath,
        parent.children[segments.at(-1)!] as NativeYValue | undefined,
        asYValue(command.definition)
      );
    }

    case 'remove_node': {
      const segments = parseNodePath(command.nodePath);
      const existing = findNode(base, segments);
      if (!existing) commandError(`Node ${command.nodePath} does not exist`);
      return assertThenUnset(nodeYOpsPath(segments), asYValue(existing));
    }

    case 'put_slot': {
      const segments = parseNodePath(command.nodePath);
      const node = requireNode(base, segments);
      const slot = assertKey(command.slot, 'slot');
      const slots = { ...(node.slots ?? {}), [slot]: clone(command.definition) };
      const requiredSlots = new Set(node.requiredSlots ?? []);
      if (command.required === true) requiredSlots.add(slot);
      if (command.required === false) requiredSlots.delete(slot);
      const updated: NodeSchema = {
        ...clone(node),
        slots,
        ...(command.required === undefined && node.requiredSlots === undefined
          ? {}
          : { requiredSlots: [...requiredSlots] }),
      };
      return assertThenSet(nodeYOpsPath(segments), asYValue(node), asYValue(updated));
    }

    case 'remove_slot': {
      const segments = parseNodePath(command.nodePath);
      const node = requireNode(base, segments);
      const slot = assertKey(command.slot, 'slot');
      if (!node.slots || !Object.hasOwn(node.slots, slot)) {
        commandError(`Slot ${command.nodePath}/${slot} does not exist`);
      }
      const slots = { ...node.slots };
      delete slots[slot];
      const updated: NodeSchema = {
        ...clone(node),
        slots,
        ...(node.requiredSlots
          ? { requiredSlots: node.requiredSlots.filter((required) => required !== slot) }
          : {}),
      };
      return assertThenSet(nodeYOpsPath(segments), asYValue(node), asYValue(updated));
    }

    case 'put_relation_type': {
      const relationType = assertKey(command.relationType, 'relationType');
      if (!base.relationTypes) {
        return assertThenSet(
          'relationTypes',
          undefined,
          asYValue({ [relationType]: clone(command.definition) })
        );
      }
      return assertThenSet(
        `relationTypes/${relationType}`,
        base.relationTypes[relationType] === undefined
          ? undefined
          : asYValue(base.relationTypes[relationType]),
        asYValue(command.definition)
      );
    }

    case 'remove_relation_type': {
      const relationType = assertKey(command.relationType, 'relationType');
      const existing = base.relationTypes?.[relationType];
      if (!existing) commandError(`Relation type ${relationType} does not exist`);
      return assertThenUnset(`relationTypes/${relationType}`, asYValue(existing));
    }

    case 'put_rule': {
      const ruleId = assertKey(command.rule.id, 'rule.id');
      const rules = base.rules ?? [];
      const matching = rules.filter((rule) => rule.id === ruleId);
      if (matching.length > 1) commandError(`Rule id ${ruleId} is ambiguous`);
      const next = matching.length
        ? rules.map((rule) => (rule.id === ruleId ? clone(command.rule) : rule))
        : [...rules, clone(command.rule)];
      return assertThenSet('rules', asYValue(rules), asYValue(next));
    }

    case 'remove_rule': {
      const ruleId = assertKey(command.ruleId, 'ruleId');
      const rules = base.rules ?? [];
      if (!rules.some((rule) => rule.id === ruleId)) commandError(`Rule ${ruleId} does not exist`);
      return assertThenSet(
        'rules',
        asYValue(rules),
        asYValue(rules.filter((rule) => rule.id !== ruleId))
      );
    }
  }
}

function operationPaths(operation: NativeYOp): string[] {
  if ('move' in operation) return [operation.move.from, operation.move.to];
  if ('clone' in operation) return [operation.clone.from, operation.clone.to];
  if ('define' in operation) return [operation.define.path];
  if ('drop' in operation) return [operation.drop.path];
  if ('rename' in operation) return [operation.rename.path];
  if ('set' in operation) return [operation.set.path];
  if ('unset' in operation) return [operation.unset.path];
  if ('populate' in operation) return [operation.populate.path];
  if ('append' in operation) return [operation.append.path];
  if ('nest' in operation) return [operation.nest.path];
  if ('split' in operation) return [operation.split.path];
  if ('fold' in operation) return [operation.fold.path];
  if ('merge' in operation) return [operation.merge.path];
  if ('sort' in operation) return [operation.sort.path];
  if ('unique' in operation) return [operation.unique.path];
  if ('pick' in operation) return [operation.pick.path];
  if ('omit' in operation) return [operation.omit.path];
  return [operation.assert.path];
}

function validateOperations(operations: readonly NativeYOp[]): NativeYOp[] {
  return operations.map((operation, index) => {
    const parsed = NativeYOpSchema.safeParse(operation);
    if (!parsed.success) {
      throw new WorkspaceSchemaYOpsError(
        'INVALID_OPERATION',
        `Schema YOps operation ${index} is invalid: ${parsed.error.issues[0]?.message ?? 'invalid operation'}`,
        index
      );
    }
    if (Object.hasOwn(operation, 'source')) {
      throw new WorkspaceSchemaYOpsError(
        'INVALID_OPERATION',
        'Schema YOps provenance must be bound by the server',
        index
      );
    }
    for (const path of operationPaths(operation)) {
      const [root] = parseNativeYOpsPath(path);
      if (!root || root.type !== 'key' || !EDITABLE_ROOTS.has(root.value)) {
        throw new WorkspaceSchemaYOpsError(
          'PATH_OUT_OF_BOUNDS',
          `Schema YOps path "${path}" is outside nodes, relationTypes, and rules`,
          index
        );
      }
    }
    return clone(parsed.data) as NativeYOp;
  });
}

/** Apply native YOps only inside the editable Schema surface, then normalize the complete result. */
export async function applyWorkspaceSchemaYOps(
  baseInput: unknown,
  operationsInput: readonly NativeYOp[]
): Promise<AppliedWorkspaceSchemaYOps> {
  const base = normalizeYSchemaObject(clone(baseInput));
  const operations = validateOperations(operationsInput);
  const applied = applyNativeYOps(asYValue(base), operations);
  if (!applied.ok) {
    throw new WorkspaceSchemaYOpsError(
      'APPLY_FAILED',
      applied.error?.message ?? 'Schema YOps apply failed',
      applied.error?.op_index
    );
  }

  let schema: YSchema;
  try {
    schema = normalizeYSchemaObject(applied.doc);
  } catch (error) {
    throw new WorkspaceSchemaYOpsError(
      'INVALID_RESULT',
      error instanceof Error ? error.message : 'Schema normalization failed'
    );
  }
  return {
    schema,
    schemaHash: (await sha256CompositionValue(schema)) as SchemaAuthoringDigest,
    operations,
  };
}

export async function executeWorkspaceSchemaEditCommand(
  baseInput: unknown,
  command: WorkspaceSchemaEditCommand
): Promise<AppliedWorkspaceSchemaYOps> {
  const operations = compileWorkspaceSchemaEditCommand(baseInput, command);
  return applyWorkspaceSchemaYOps(baseInput, operations);
}
