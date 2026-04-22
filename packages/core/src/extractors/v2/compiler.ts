import type { SourcedYOp, YValue } from '../../t3x-yops/types';
import { createExtractionFailure, type ExtractionFailure } from './failures';
import type {
  CompiledMutationPlan,
  CompileInput,
  DraftEvidence,
  ExtractionDraftItem,
} from './types';

const DEFAULT_VALUE_SLOT = 'value';

export type CompileResult =
  | { ok: true; ops: SourcedYOp[]; warnings: string[] }
  | { ok: false; failure: ExtractionFailure; warnings: string[] };

function normalizeYValue(value: unknown): YValue {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeYValue(item));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      normalizeYValue(entry),
    ])
  );
}

function sortRecordValues(values: Record<string, unknown>): Record<string, YValue> {
  return Object.fromEntries(
    Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, normalizeYValue(value)])
  );
}

function buildSource(
  evidence: DraftEvidence,
  input: Pick<CompileInput, 'sourceModel' | 'extractedAt' | 'turnHashByTag'>
): SourcedYOp['source'] | ExtractionFailure {
  const turnHash = input.turnHashByTag[evidence.turn_tag];
  if (!turnHash) {
    return createExtractionFailure(
      'provenance',
      `Missing full turn hash for evidence tag ${evidence.turn_tag}`,
      { details: { turn_tag: evidence.turn_tag } }
    );
  }

  return {
    type: 'llm',
    model: input.sourceModel,
    at: input.extractedAt,
    turn_ref: {
      turn_hash: turnHash,
      quote: evidence.quote,
    },
  };
}

function resolveTargetPath(item: ExtractionDraftItem): string | null {
  return (
    item.target_ref?.path ??
    item.target_ref?.node_key ??
    item.candidate.path_hint ??
    item.candidate.key ??
    null
  );
}

function synthesizeAddPath(item: ExtractionDraftItem): string {
  // F8a: small models (nano) occasionally emit `add` items with neither key
  // nor path_hint. Synthesize a deterministic, slug-safe path from the first
  // short string value in candidate.values, falling back to item.id.
  const pickString = (record: Record<string, unknown> | undefined): string | null => {
    if (!record) return null;
    for (const value of Object.values(record)) {
      if (typeof value === 'string' && value.length > 0 && value.length < 80) {
        return value;
      }
    }
    return null;
  };

  const candidate = item.candidate.values
    ? pickString(item.candidate.values as Record<string, unknown>)
    : null;
  const raw = candidate ?? item.id;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return slug.length > 0 ? slug : 'item';
}

function getTargetSlot(item: ExtractionDraftItem): string | null {
  if (item.candidate.slot) {
    return item.candidate.slot;
  }

  return item.candidate.value !== undefined ? DEFAULT_VALUE_SLOT : null;
}

function compileItem(item: ExtractionDraftItem, input: CompileInput): CompileResult {
  const primaryEvidence =
    item.evidence.find((evidence) => evidence.role === 'primary') ?? item.evidence[0];
  const source = buildSource(primaryEvidence, input);
  if ('code' in source) {
    return { ok: false, failure: source, warnings: [] };
  }

  if (item.intent === 'noop') {
    return { ok: true, ops: [], warnings: [] };
  }

  // F8b: In bootstrap mode there is no existing snapshot to update or
  // reinforce against. Small models (e.g. gpt-5.4-nano) sometimes emit
  // these intents anyway and the apply stage fails with
  // `Path X does not exist`. Deterministically promote them to `add` so
  // the node gets defined + populated on the way in.
  let effectiveIntent = item.intent;
  let promotedFrom: typeof item.intent | null = null;
  if (
    input.draft.mode === 'bootstrap' &&
    (item.intent === 'update' || item.intent === 'reinforce')
  ) {
    effectiveIntent = 'add';
    promotedFrom = item.intent;
  }

  if (effectiveIntent === 'add') {
    const warnings: string[] = [];
    let path =
      item.candidate.path_hint ??
      item.candidate.key ??
      (promotedFrom ? resolveTargetPath(item) : null);

    if (promotedFrom) {
      warnings.push(`Promoted ${promotedFrom} to add in bootstrap mode for item ${item.id}`);
    }

    if (!path) {
      // F8a: synthesize a deterministic path when the model omitted both key
      // and path_hint instead of hard-failing compile.
      path = synthesizeAddPath(item);
      warnings.push(
        `Synthesized path "${path}" for add intent (item ${item.id}) lacking candidate.key and path_hint`
      );
    }

    const ops: SourcedYOp[] = [{ define: { path }, source }];
    if (item.candidate.values && Object.keys(item.candidate.values).length > 0) {
      ops.push({
        populate: { path, values: sortRecordValues(item.candidate.values) },
        source,
      });
    }

    const targetSlot = getTargetSlot(item);
    if (targetSlot && item.candidate.value !== undefined) {
      ops.push({
        set: { path: `${path}/${targetSlot}`, value: item.candidate.value },
        source,
      });
    }

    return { ok: true, ops, warnings };
  }

  if (item.intent === 'remove') {
    const path = resolveTargetPath(item);
    if (!path) {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          'remove intent requires target_ref or candidate path'
        ),
        warnings: [],
      };
    }

    return { ok: true, ops: [{ drop: { path }, source }], warnings: [] };
  }

  if (item.intent === 'update' || item.intent === 'reinforce') {
    const path = resolveTargetPath(item);
    if (!path) {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          `${item.intent} intent requires target_ref.path or target_ref.node_key`
        ),
        warnings: [],
      };
    }

    const ops: SourcedYOp[] = [];
    if (item.candidate.values && Object.keys(item.candidate.values).length > 0) {
      ops.push({
        populate: { path, values: sortRecordValues(item.candidate.values) },
        source,
      });
    }

    const targetSlot = getTargetSlot(item);
    if (targetSlot && item.candidate.value !== undefined) {
      ops.push({
        set: { path: `${path}/${targetSlot}`, value: item.candidate.value },
        source,
      });
    }

    if (ops.length === 0) {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          `${item.intent} intent requires candidate.values or candidate.value`,
          {
            details: {
              reaskable: true,
              intent: item.intent,
              path,
            },
          }
        ),
        warnings: [],
      };
    }

    return { ok: true, ops, warnings: [] };
  }

  return {
    ok: false,
    failure: createExtractionFailure('compile', `Unsupported draft intent: ${String(item.intent)}`),
    warnings: [],
  };
}

function dedupeDefineOps(ops: SourcedYOp[]): { ops: SourcedYOp[]; warnings: string[] } {
  const defined = new Set<string>();
  const kept: SourcedYOp[] = [];
  const warnings: string[] = [];

  for (const op of ops) {
    if ('define' in op) {
      const path = op.define.path;
      if (defined.has(path)) {
        warnings.push(`Dropped duplicate define op for path "${path}"`);
        continue;
      }
      defined.add(path);
    }
    kept.push(op);
  }

  return { ops: kept, warnings };
}

export function compileExtractionDraft(input: CompileInput): CompileResult {
  const ops: SourcedYOp[] = [];
  const warnings: string[] = [];

  for (const item of input.draft.items) {
    const compiled = compileItem(item, input);
    if (!compiled.ok) {
      return compiled;
    }
    ops.push(...compiled.ops);
    warnings.push(...compiled.warnings);
  }

  const deduped = dedupeDefineOps(ops);
  return { ok: true, ops: deduped.ops, warnings: [...warnings, ...deduped.warnings] };
}

export function toCompiledMutationPlan(
  result: Extract<CompileResult, { ok: true }>
): CompiledMutationPlan {
  return {
    ops: result.ops,
    warnings: result.warnings,
  };
}
