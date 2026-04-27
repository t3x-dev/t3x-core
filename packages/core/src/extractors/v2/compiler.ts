import { SNAKE_CASE_KEY, type SourcedYOp, type YValue } from '../../t3x-yops/types';
import { createExtractionFailure, type ExtractionFailure } from './failures';
import type {
  CompiledMutationPlan,
  CompileInput,
  DraftEvidence,
  ExtractionDraftItem,
} from './types';

const DEFAULT_VALUE_SLOT = 'value';

/**
 * Result of normalizing an LLM-emitted path string.
 *
 *   - `ok`      — the input was present and produced a valid YOps path.
 *   - `invalid` — the input was present but malformed (segment failed
 *                 SNAKE_CASE_KEY, kebab/camel/space, etc.). Callers MUST
 *                 surface this as a compile failure rather than fall
 *                 through to the next candidate. Letting a bad
 *                 `target_ref.path` silently become `candidate.key`
 *                 changes the hierarchy without the model ever knowing
 *                 it produced wrong data — exactly the pattern the
 *                 review thread flagged as P2 silent fallback.
 *   - `absent`  — the input wasn't provided. Caller falls through to
 *                 the next candidate in the priority chain.
 */
export type NormalizePathResult =
  | { kind: 'ok'; path: string }
  | { kind: 'invalid'; reason: string; raw: string }
  | { kind: 'absent' };

/**
 * Normalize an LLM-emitted path string to the YOps wire shape.
 *
 *   - Trim surrounding whitespace.
 *   - `.` → `/`. Per `packages/yops/yops.yaml`, `/` is the path separator
 *     and dots are not legal key characters. Small models (gpt-5.4-nano,
 *     etc.) frequently emit dotted paths thinking they're nested; without
 *     this rewrite the engine treats `story.overview.major_conflicts` as
 *     a single root key with literal dots, which renders as a flat tree.
 *   - Collapse runs of `/`, strip leading/trailing `/`.
 *   - Validate each segment against SNAKE_CASE_KEY.
 *
 * Returns a discriminated `NormalizePathResult` so callers can tell
 * "field absent (try next)" apart from "field present but malformed
 * (fail compile, ask the model to fix this specific field)".
 */
export function normalizePath(raw: string | undefined | null): NormalizePathResult {
  if (raw == null) return { kind: 'absent' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: 'absent' };

  const slashed = trimmed.replace(/\./g, '/');
  const segments = slashed.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    return { kind: 'invalid', reason: 'empty after collapsing separators', raw };
  }

  for (const segment of segments) {
    if (!SNAKE_CASE_KEY.test(segment)) {
      return {
        kind: 'invalid',
        reason: `segment "${segment}" must match SNAKE_CASE_KEY (lowercase, digits, underscores; cannot start with a digit)`,
        raw,
      };
    }
  }
  return { kind: 'ok', path: segments.join('/') };
}

/**
 * Walk a priority-ordered list of (field, raw) candidates and return:
 *
 *   - `{kind:'ok', path}`      when the first non-absent candidate is valid
 *   - `{kind:'invalid',
 *       failure}`              when the first non-absent candidate is
 *                              malformed (returns a typed `compile` failure
 *                              with `reaskable:true` and the offending
 *                              field name baked into details).
 *   - `{kind:'absent'}`        when every candidate is missing or empty.
 *
 * This is the fail-fast version of the old "loop, take first non-null"
 * approach: a malformed `target_ref.path` no longer silently becomes
 * `candidate.key`. The model gets told which specific field to fix.
 */
function resolvePathFromCandidates(
  itemId: string,
  candidates: Array<{ field: string; raw: string | undefined | null }>
):
  | { kind: 'ok'; path: string }
  | { kind: 'invalid'; failure: ExtractionFailure }
  | { kind: 'absent' } {
  for (const { field, raw } of candidates) {
    const r = normalizePath(raw);
    if (r.kind === 'ok') return { kind: 'ok', path: r.path };
    if (r.kind === 'invalid') {
      return {
        kind: 'invalid',
        failure: createExtractionFailure(
          'compile',
          `Invalid ${field} on item ${itemId}: ${r.reason}`,
          {
            details: {
              reaskable: true,
              item_id: itemId,
              field,
              invalid_path: r.raw,
              reason: r.reason,
            },
          }
        ),
      };
    }
    // absent — keep walking the chain
  }
  return { kind: 'absent' };
}

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

/**
 * Resolve the target path for non-add intents (remove / update / reinforce).
 *
 * Priority order is unchanged: target_ref.path → target_ref.node_key →
 * candidate.path_hint → candidate.key. The change is the *failure mode*:
 * an invalid (malformed-but-present) candidate now stops the walk with a
 * typed compile failure naming that field, rather than silently falling
 * through to the next field. See `resolvePathFromCandidates` for details.
 */
function resolveTargetPath(
  item: ExtractionDraftItem
):
  | { kind: 'ok'; path: string }
  | { kind: 'invalid'; failure: ExtractionFailure }
  | { kind: 'absent' } {
  return resolvePathFromCandidates(item.id, [
    { field: 'target_ref.path', raw: item.target_ref?.path },
    { field: 'target_ref.node_key', raw: item.target_ref?.node_key },
    { field: 'candidate.path_hint', raw: item.candidate.path_hint },
    { field: 'candidate.key', raw: item.candidate.key },
  ]);
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

/**
 * Compile `item.candidate.children` into nested define + populate ops
 * under `parentPath`.
 *
 * The provider contract (DraftCandidateChildSchema) is one level deep:
 * `{ key: string, values?: Record<string, unknown> }`. So this is a flat
 * loop, not a tree walk — but each child key still goes through the same
 * normaliser as the parent path (handles a model emitting `key: 'a.b'`
 * by converting dots to slashes and segment-validating).
 *
 * Used by add / update / reinforce intents. Before this helper existed,
 * children were compiled only inside the add branch; update + reinforce
 * accepted children through the schema and silently dropped them on the
 * floor — the same data-loss shape the review originally flagged as P1
 * for the add path.
 */
function compileChildren(
  item: ExtractionDraftItem,
  parentPath: string,
  source: SourcedYOp['source'],
  warnings: string[]
): { ok: true; ops: SourcedYOp[] } | { ok: false; failure: ExtractionFailure; warnings: string[] } {
  const children = item.candidate.children ?? [];
  const ops: SourcedYOp[] = [];
  for (const child of children) {
    const result = normalizePath(child.key);
    if (result.kind === 'absent') {
      // Schema requires `key: z.string().min(1)`, so absent should not
      // happen — but defend anyway. Treat as invalid.
      return {
        ok: false,
        failure: createExtractionFailure('compile', `Child key on item ${item.id} is empty`, {
          details: {
            reaskable: true,
            item_id: item.id,
            field: 'candidate.children[].key',
            invalid_key: child.key,
          },
        }),
        warnings,
      };
    }
    if (result.kind === 'invalid') {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          `Child key "${child.key}" on item ${item.id}: ${result.reason}`,
          {
            details: {
              reaskable: true,
              item_id: item.id,
              field: 'candidate.children[].key',
              invalid_key: child.key,
              reason: result.reason,
            },
          }
        ),
        warnings,
      };
    }
    const childPath = `${parentPath}/${result.path}`;
    ops.push({ define: { path: childPath }, source });
    if (child.values && Object.keys(child.values).length > 0) {
      ops.push({
        populate: { path: childPath, values: sortRecordValues(child.values) },
        source,
      });
    }
  }
  return { ok: true, ops };
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

    // Resolve the add path through the discriminated chain so a malformed
    // `candidate.path_hint` no longer silently falls through to
    // `candidate.key` (or, when promoted, to `target_ref.*`). If any
    // present-but-invalid candidate appears in the chain, return a
    // typed compile failure naming that field.
    const addCandidates: Array<{ field: string; raw: string | undefined | null }> = [
      { field: 'candidate.path_hint', raw: item.candidate.path_hint },
      { field: 'candidate.key', raw: item.candidate.key },
    ];
    if (promotedFrom) {
      addCandidates.push(
        { field: 'target_ref.path', raw: item.target_ref?.path },
        { field: 'target_ref.node_key', raw: item.target_ref?.node_key }
      );
    }

    const resolved = resolvePathFromCandidates(item.id, addCandidates);
    if (resolved.kind === 'invalid') {
      return { ok: false, failure: resolved.failure, warnings };
    }

    let path: string;
    if (resolved.kind === 'ok') {
      path = resolved.path;
    } else {
      // F8a: synthesize a deterministic path when the model omitted every
      // path source instead of hard-failing compile. The slug regex in
      // `synthesizeAddPath` already produces SNAKE_CASE_KEY-safe output;
      // we still funnel through `normalizePath` for symmetry. The
      // synthesised slug should always be `ok`; if it weren't, we'd
      // rather hard-fail than ship a bad path.
      const synthesized = synthesizeAddPath(item);
      const synthResult = normalizePath(synthesized);
      if (synthResult.kind !== 'ok') {
        return {
          ok: false,
          failure: createExtractionFailure(
            'compile',
            `Could not derive a valid path for add item ${item.id} (synthesised "${synthesized}")`,
            { details: { item_id: item.id, synthesized } }
          ),
          warnings,
        };
      }
      path = synthResult.path;
      warnings.push(
        `Synthesized path "${path}" for add intent (item ${item.id}) lacking candidate.key and path_hint`
      );
    }

    if (promotedFrom) {
      warnings.push(`Promoted ${promotedFrom} to add in bootstrap mode for item ${item.id}`);
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

    const childrenResult = compileChildren(item, path, source, warnings);
    if (!childrenResult.ok) return childrenResult;
    ops.push(...childrenResult.ops);

    return { ok: true, ops, warnings };
  }

  if (item.intent === 'remove') {
    const resolved = resolveTargetPath(item);
    if (resolved.kind === 'invalid') {
      return { ok: false, failure: resolved.failure, warnings: [] };
    }
    if (resolved.kind === 'absent') {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          'remove intent requires target_ref or candidate path'
        ),
        warnings: [],
      };
    }

    return { ok: true, ops: [{ drop: { path: resolved.path }, source }], warnings: [] };
  }

  if (item.intent === 'update' || item.intent === 'reinforce') {
    const resolved = resolveTargetPath(item);
    if (resolved.kind === 'invalid') {
      return { ok: false, failure: resolved.failure, warnings: [] };
    }
    if (resolved.kind === 'absent') {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          `${item.intent} intent requires target_ref.path or target_ref.node_key`
        ),
        warnings: [],
      };
    }
    const path = resolved.path;

    const ops: SourcedYOp[] = [];
    const warnings: string[] = [];
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

    // Children also flow through update / reinforce. The provider schema
    // accepts them on every intent, and a model that emits children on
    // an update is saying "also add these subnodes under the resolved
    // target path." Pre-fix the compiler ignored them silently; same P1
    // shape as the add branch, just outside bootstrap-promotion.
    const childrenResult = compileChildren(item, path, source, warnings);
    if (!childrenResult.ok) return childrenResult;
    ops.push(...childrenResult.ops);

    if (ops.length === 0) {
      return {
        ok: false,
        failure: createExtractionFailure(
          'compile',
          `${item.intent} intent requires candidate.values, candidate.value, or candidate.children`,
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

    return { ok: true, ops, warnings };
  }

  return {
    ok: false,
    failure: createExtractionFailure('compile', `Unsupported draft intent: ${String(item.intent)}`),
    warnings: [],
  };
}

/**
 * Returns the primary target path of an op, or null if the op shape doesn't
 * have one. Used by `dedupeDefineOps` to track which paths a batch implies
 * already exist at apply time (any non-define op that targets a path
 * effectively asserts the path already exists in the document, since
 * `populate` / `set` / `assert` / `unset` / etc. all require resolution).
 */
function primaryPathOf(op: SourcedYOp): string | null {
  if ('define' in op) return op.define.path;
  if ('populate' in op) return op.populate.path;
  if ('set' in op) return op.set.path;
  if ('append' in op) return op.append.path;
  if ('unset' in op) return op.unset.path;
  if ('drop' in op) return op.drop.path;
  if ('assert' in op) return op.assert.path;
  if ('rename' in op) return op.rename.path;
  if ('fold' in op) return op.fold.path;
  if ('sort' in op) return op.sort.path;
  if ('unique' in op) return op.unique.path;
  if ('pick' in op) return op.pick.path;
  if ('omit' in op) return op.omit.path;
  if ('nest' in op) return op.nest.path;
  if ('split' in op) return op.split.path;
  if ('merge' in op) return op.merge.path;
  if ('move' in op) return op.move.from;
  if ('clone' in op) return op.clone.from;
  return null;
}

/**
 * Normalize the define ops in a compiled batch:
 *
 *   1. Insert ancestor defines so every multi-segment `define` path is
 *      preceded by defines for each parent that the batch hasn't already
 *      brought into scope. The YOps `define` op is strict ("parent must
 *      exist and be a mapping") — there is no mkdir-p — so a bootstrap
 *      add at `trip/duration_days` compiles to `define trip` followed by
 *      `define trip/duration_days`. Auto-emitted parents inherit the
 *      triggering op's `source`.
 *
 *      A non-define op (populate / set / etc.) earlier in the batch is
 *      taken as evidence that its target path already exists at apply
 *      time. So an `update` item that emits `populate characters` and
 *      then `define characters/rival` does NOT receive an injected
 *      `define characters` — that would fail with ALREADY_EXISTS.
 *
 *   2. Drop redundant `define` ops at paths already defined earlier in
 *      the batch. Inferred parent defines are silent; explicit duplicates
 *      from the LLM still produce a warning so callers can see the model
 *      proposed the same path twice.
 */
/**
 * Add `path` and every ancestor segment to `set`. A path that exists at
 * apply time implies all of its ancestors also exist; tracking only the
 * leaf would leave a deeper sibling-of-ancestor define injecting a
 * recreation op against a live node (ALREADY_EXISTS at apply time).
 */
function seedPathAndAncestors(set: Set<string>, path: string): void {
  const segments = path.split('/').filter((s) => s.length > 0);
  let prefix = '';
  for (const segment of segments) {
    prefix = prefix === '' ? segment : `${prefix}/${segment}`;
    set.add(prefix);
  }
}

function dedupeDefineOps(
  ops: SourcedYOp[],
  preExistingPaths: Iterable<string> = []
): { ops: SourcedYOp[]; warnings: string[] } {
  const knownExisting = new Set<string>();
  for (const path of preExistingPaths) {
    seedPathAndAncestors(knownExisting, path);
  }
  const defined = new Set<string>();
  const kept: SourcedYOp[] = [];
  const warnings: string[] = [];

  for (const op of ops) {
    if (!('define' in op)) {
      const path = primaryPathOf(op);
      if (path !== null) seedPathAndAncestors(knownExisting, path);
      kept.push(op);
      continue;
    }

    const path = op.define.path;
    const segments = path.split('/').filter((s) => s.length > 0);

    let prefix = '';
    for (let i = 0; i < segments.length - 1; i++) {
      prefix = prefix === '' ? segments[i] : `${prefix}/${segments[i]}`;
      if (!knownExisting.has(prefix) && !defined.has(prefix)) {
        kept.push({ define: { path: prefix }, source: op.source } as SourcedYOp);
        defined.add(prefix);
        knownExisting.add(prefix);
      }
    }

    if (defined.has(path)) {
      warnings.push(`Dropped duplicate define op for path "${path}"`);
      continue;
    }
    defined.add(path);
    knownExisting.add(path);
    kept.push(op);
  }

  return { ops: kept, warnings };
}

/**
 * Quality guard: returns true when every op a draft item produced is a bare
 * `define` (no `populate`, no `set`). That shape is the small-model failure
 * mode where the LLM transcribes an assistant response's section headers as
 * an outline of empty nodes — `camera_comparison`, `decision_rule_*`, etc. —
 * with no concrete facts attached. Applying it just pollutes the workspace
 * with empty buckets the user has to clean up.
 *
 * We treat this as a deterministic pipeline filter, not a prompt issue: any
 * model that emits an item without at least one `populate`/`set` is
 * proposing structure for its own sake. The pipeline must catch this even
 * when the prompt fails to deter it.
 *
 * Items with at least one `populate` or `set` (whether from `candidate.values`,
 * `candidate.value`, or any populated child) pass through this check. The
 * subsequent path-level pruner (`pruneUnreachableScaffold`) then trims any
 * empty leaf defines that survived inside an otherwise-good item.
 *
 * Items with no ops at all (e.g. `intent: noop`) pass through — they're not
 * "empty defines", they're "no-op by design".
 */
function itemIsEmptyDefinesOnly(ops: readonly SourcedYOp[]): boolean {
  if (ops.length === 0) return false;
  return ops.every((op) => 'define' in op);
}

/**
 * Returns true if `ancestor` equals `path` or is a strict ancestor of it
 * (e.g. `cameras` is an ancestor of `cameras/a7r_v` but not of
 * `cameras_other`). YOps paths use `/` as the segment separator and
 * `compileItem` builds child paths via `${parentPath}/${childPath}`,
 * so prefix-match-on-segment-boundary is sufficient.
 */
function isAncestorOrSelf(ancestor: string, path: string): boolean {
  if (ancestor === path) return true;
  return path.startsWith(`${ancestor}/`);
}

/**
 * Path-level pruner: drops `define` ops whose path is neither equal to
 * nor an ancestor of any `populate`/`set` path in the same op list.
 *
 * Closes the mixed-item gap that the per-item `itemIsEmptyDefinesOnly`
 * filter doesn't catch: an item with one populated child and one bare
 * child compiles to a populate plus *both* defines. The per-item filter
 * keeps the item (one populate exists), but the bare child's define is
 * still an empty bucket the workspace shouldn't render. This pruner
 * removes those leaves while preserving the scaffold defines that are
 * actually needed for the populated paths.
 *
 * Operates on the full ops list (post-dedupe) so a scaffold define
 * emitted by one item that supports a populate from a different item
 * is preserved — cross-item scaffolding is real and we mustn't break
 * apply-time path validation.
 *
 * Returns the pruned ops plus warnings naming each dropped define path.
 */
function pruneUnreachableScaffold(ops: readonly SourcedYOp[]): {
  ops: SourcedYOp[];
  warnings: string[];
} {
  const populatedPaths: string[] = [];
  for (const op of ops) {
    if ('populate' in op) populatedPaths.push(op.populate.path);
    else if ('set' in op) populatedPaths.push(op.set.path);
  }

  // No populate/set anywhere → all defines are unreachable. The per-item
  // filter should have caught this already, but be defensive.
  if (populatedPaths.length === 0) {
    const dropped = ops
      .filter((op): op is Extract<SourcedYOp, { define: { path: string } }> => 'define' in op)
      .map((op) => op.define.path);
    return {
      ops: ops.filter((op) => !('define' in op)),
      warnings: dropped.map(
        (path) =>
          `Pruned scaffold define "${path}": no populate or set ops in the batch reach this path.`
      ),
    };
  }

  const kept: SourcedYOp[] = [];
  const dropped: string[] = [];
  for (const op of ops) {
    if (!('define' in op)) {
      kept.push(op);
      continue;
    }
    const path = op.define.path;
    const reachable = populatedPaths.some((populated) => isAncestorOrSelf(path, populated));
    if (reachable) {
      kept.push(op);
    } else {
      dropped.push(path);
    }
  }
  return {
    ops: kept,
    warnings: dropped.map(
      (path) =>
        `Pruned scaffold define "${path}": no populate or set descendant — likely an empty section-header node.`
    ),
  };
}

export function compileExtractionDraft(input: CompileInput): CompileResult {
  const ops: SourcedYOp[] = [];
  const warnings: string[] = [];

  for (const item of input.draft.items) {
    const compiled = compileItem(item, input);
    if (!compiled.ok) {
      // Strict path (default): one bad item kills the whole batch — every
      // existing caller relies on this contract.
      if (!input.allowPartial) {
        return compiled;
      }
      // Partial path: keep going. Name the dropped item so the caller
      // can surface what was lost without the user having to diff
      // before/after trees by hand.
      warnings.push(
        `Dropped item "${item.id}" during partial compile: ${compiled.failure.message}`
      );
      continue;
    }

    // Deterministic empty-define guard. Runs in BOTH strict and partial
    // modes: a junk item that creates an empty bucket isn't an
    // "error" the LLM can be reasked to fix in a useful way (the
    // model thought it was extracting structure), but it should never
    // reach the workspace. Drop with a warning so callers can see
    // what was filtered.
    if (itemIsEmptyDefinesOnly(compiled.ops)) {
      warnings.push(
        `Dropped item "${item.id}": produced only empty define ops (no slots, values, or populated children). ` +
          `LLM proposed structure without concrete facts; the pipeline filter rejected it.`
      );
      continue;
    }

    ops.push(...compiled.ops);
    warnings.push(...compiled.warnings);
  }

  // `target_ref.path` on update / reinforce / remove items names a path
  // that already exists in the snapshot the compile is being applied to.
  // Seed the dedupe pass with these so ancestor-define injection doesn't
  // try to recreate them and trip ALREADY_EXISTS at apply time.
  const preExisting: string[] = [];
  for (const item of input.draft.items) {
    const targetPath = item.target_ref?.path;
    if (typeof targetPath === 'string' && targetPath.length > 0) {
      preExisting.push(targetPath);
    }
  }

  const deduped = dedupeDefineOps(ops, preExisting);
  // Path-level pruning runs after dedupe so it sees the full
  // post-merge scaffold. A define from item A that supports a populate
  // from item B is preserved; a leaf define with no populate descendant
  // anywhere in the batch is dropped — closes the mixed-item gap where
  // an item with one populated child and one bare child would otherwise
  // leave the bare child's define as workspace pollution.
  const pruned = pruneUnreachableScaffold(deduped.ops);
  return {
    ok: true,
    ops: pruned.ops,
    warnings: [...warnings, ...deduped.warnings, ...pruned.warnings],
  };
}

export function toCompiledMutationPlan(
  result: Extract<CompileResult, { ok: true }>
): CompiledMutationPlan {
  return {
    ops: result.ops,
    warnings: result.warnings,
  };
}
