import type { SourcedYOp, YValue } from '../../t3x-yops/types';
import { createExtractionFailure, type ExtractionFailure } from './failures';
import type {
  CompiledMutationPlan,
  CompileInput,
  DraftEvidence,
  ExtractionDraftItem,
} from './types';

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

  if (item.intent === 'add') {
    const path = item.candidate.path_hint ?? item.candidate.key ?? null;
    if (!path) {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          'add intent requires candidate.key or candidate.path_hint'
        ),
        warnings: [],
      };
    }

    const ops: SourcedYOp[] = [{ define: { path }, source }];
    if (item.candidate.values && Object.keys(item.candidate.values).length > 0) {
      ops.push({
        populate: { path, values: sortRecordValues(item.candidate.values) },
        source,
      });
    }

    if (item.candidate.slot && item.candidate.value !== undefined) {
      ops.push({
        set: { path: `${path}/${item.candidate.slot}`, value: item.candidate.value },
        source,
      });
    }

    return { ok: true, ops, warnings: [] };
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

    if (item.candidate.slot && item.candidate.value !== undefined) {
      ops.push({
        set: { path: `${path}/${item.candidate.slot}`, value: item.candidate.value },
        source,
      });
    }

    if (ops.length === 0) {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          `${item.intent} intent requires candidate.values or candidate.slot + candidate.value`,
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

  return { ok: true, ops, warnings };
}

export function toCompiledMutationPlan(
  result: Extract<CompileResult, { ok: true }>
): CompiledMutationPlan {
  return {
    ops: result.ops,
    warnings: result.warnings,
  };
}
