import { generatePromptContract, type PromptSlotContract, type YSchema } from '@t3x-dev/yschema';
import { sha256 } from '../../common';
import type { SemanticContent, SlotValue, TreeNode } from '../../semantic/types';
import type { YValue } from '../../t3x-yops/types';

export type ExtractionTargetValueType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null';

export interface ExtractionTarget {
  target_id: string;
  parent_path: string;
  slot: string;
  value_type?: ExtractionTargetValueType;
  enum?: YValue[];
  const?: YValue;
  current_value?: YValue;
  description?: string;
  content_guidance?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxWords?: number;
  pattern?: string;
  format?: string;
  provenanceRequired?: boolean;
  source: 'current_state' | 'yschema';
}

export interface ExtractionTargetCatalog {
  schema: 't3x/extraction-target-catalog';
  version: 1;
  targets: ExtractionTarget[];
  digest: `sha256:${string}`;
  warnings: string[];
}

export interface BuildExtractionTargetCatalogInput {
  snapshot?: SemanticContent;
  yschema?: YSchema;
  yschemaRootKey?: string;
  maxTargets?: number;
}

export type BuildExtractionTargetCatalogResult =
  | { ok: true; catalog: ExtractionTargetCatalog }
  | { ok: false; reason: string };

interface MutableTarget {
  parent_path: string;
  slot: string;
  value_type?: ExtractionTargetValueType;
  enum?: YValue[];
  const?: YValue;
  current_value?: YValue;
  description?: string;
  content_guidance?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxWords?: number;
  pattern?: string;
  format?: string;
  provenanceRequired?: boolean;
  source: 'current_state' | 'yschema';
}

const DEFAULT_MAX_TARGETS = 80;

function asYValue(value: SlotValue): YValue {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => asYValue(item));
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, asYValue(entry)]));
}

function valueTypeOf(value: YValue): ExtractionTargetValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  return 'object';
}

function splitLeafPath(path: string): { parent_path: string; slot: string } | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const slot = segments[segments.length - 1];
  return { parent_path: segments.slice(0, -1).join('/'), slot };
}

function prefixedSchemaPath(path: string, rootKey?: string): string {
  const segments = path.split('/').filter(Boolean);
  const normalizedRoot = rootKey?.trim();
  if (!normalizedRoot) return segments.join('/');
  return segments[0] === normalizedRoot
    ? segments.join('/')
    : [normalizedRoot, ...segments].join('/');
}

function targetPath(target: Pick<MutableTarget, 'parent_path' | 'slot'>): string {
  return `${target.parent_path}/${target.slot}`;
}

function hasCurrentValue(target: MutableTarget): boolean {
  return Object.keys(target).includes('current_value');
}

function mergeTarget(left: MutableTarget, right: MutableTarget): MutableTarget {
  return {
    ...left,
    ...right,
    current_value:
      hasCurrentValue(left) && !hasCurrentValue(right) ? left.current_value : right.current_value,
    source: hasCurrentValue(left) ? 'current_state' : right.source,
  };
}

function collectStateTargets(snapshot: SemanticContent | undefined): MutableTarget[] {
  const targets: MutableTarget[] = [];

  function visit(node: TreeNode, parentPath: string | null): void {
    const nodePath = parentPath ? `${parentPath}/${node.key}` : node.key;
    for (const [slot, rawValue] of Object.entries(node.slots ?? {})) {
      const value = asYValue(rawValue);
      targets.push({
        parent_path: nodePath,
        slot,
        value_type: valueTypeOf(value),
        current_value: value,
        source: 'current_state',
      });
    }
    for (const child of node.children ?? []) visit(child, nodePath);
  }

  for (const tree of snapshot?.trees ?? []) visit(tree, null);
  return targets;
}

function slotToTarget(slot: PromptSlotContract, rootKey?: string): MutableTarget | null {
  const path = prefixedSchemaPath(slot.path, rootKey);
  if (path.split('/').includes('*')) return null;
  const split = splitLeafPath(path);
  if (!split) return null;

  return {
    ...split,
    ...(slot.type ? { value_type: slot.type } : {}),
    ...(slot.enum ? { enum: slot.enum.map((value) => structuredClone(value)) } : {}),
    ...(slot.const !== undefined ? { const: structuredClone(slot.const) } : {}),
    ...(slot.description ? { description: slot.description } : {}),
    ...(slot.contentGuidance ? { content_guidance: slot.contentGuidance } : {}),
    ...(slot.minimum !== undefined ? { minimum: slot.minimum } : {}),
    ...(slot.maximum !== undefined ? { maximum: slot.maximum } : {}),
    ...(slot.minLength !== undefined ? { minLength: slot.minLength } : {}),
    ...(slot.maxLength !== undefined ? { maxLength: slot.maxLength } : {}),
    ...(slot.maxWords !== undefined ? { maxWords: slot.maxWords } : {}),
    ...(slot.pattern ? { pattern: slot.pattern } : {}),
    ...(slot.format ? { format: slot.format } : {}),
    ...(slot.provenanceRequired !== undefined
      ? { provenanceRequired: slot.provenanceRequired }
      : {}),
    source: 'yschema',
  };
}

function collectYSchemaTargets(yschema: YSchema | undefined, rootKey?: string): MutableTarget[] {
  if (!yschema) return [];
  const contract = generatePromptContract(yschema);
  return contract.nodes.flatMap((node) =>
    node.slots.flatMap((slot) => {
      const target = slotToTarget(slot, rootKey);
      return target ? [target] : [];
    })
  );
}

export function buildExtractionTargetCatalog(
  input: BuildExtractionTargetCatalogInput
): BuildExtractionTargetCatalogResult {
  const byPath = new Map<string, MutableTarget>();
  const warnings: string[] = [];

  for (const target of [
    ...collectStateTargets(input.snapshot),
    ...collectYSchemaTargets(input.yschema, input.yschemaRootKey),
  ]) {
    const path = targetPath(target);
    const existing = byPath.get(path);
    byPath.set(path, existing ? mergeTarget(existing, target) : target);
  }

  const sorted = [...byPath.values()].sort((left, right) =>
    targetPath(left).localeCompare(targetPath(right))
  );
  const maxTargets = input.maxTargets ?? DEFAULT_MAX_TARGETS;
  if (sorted.length === 0) return { ok: false, reason: 'no writable leaf targets' };
  if (sorted.length > maxTargets) {
    return {
      ok: false,
      reason: `target catalog has ${sorted.length} entries, above limit ${maxTargets}`,
    };
  }

  const targets = sorted.map(
    (target, index): ExtractionTarget => ({
      target_id: `T${String(index + 1).padStart(3, '0')}`,
      ...target,
    })
  );
  const digest = `sha256:${sha256({
    schema: 't3x/extraction-target-catalog',
    version: 1,
    targets,
  })}` as const;

  return {
    ok: true,
    catalog: {
      schema: 't3x/extraction-target-catalog',
      version: 1,
      targets,
      digest,
      warnings,
    },
  };
}
