import type { MergeWorkspaceDecision } from '@t3x-dev/api-client';
import type { MergeDecision, MergeResolution } from '@t3x-dev/core';

export interface ApiPullRequestMergeReviewSlot {
  key: string;
  base?: unknown;
  source?: unknown;
  target?: unknown;
  merged?: unknown;
  conflict: boolean;
}

export interface ApiPullRequestMergeReviewNode {
  path: string;
  status: 'conflict' | 'auto' | 'source_only' | 'target_only';
  presence: { base: boolean; source: boolean; target: boolean };
  slots: ApiPullRequestMergeReviewSlot[];
}

export interface ApiPullRequestMergeReview {
  schema_merge?: {
    schema_hash: string;
    root_key: string;
    changes: Array<{ kind: 'ADD' | 'CHANGE' | 'REMOVE'; path: string; summary: string }>;
    conflicts?: Array<{ path: string; base?: unknown; source?: unknown; target?: unknown }>;
    unresolved?: string[];
    definition_error?: string | null;
    before?: unknown;
    after?: unknown;
    issues?: Array<{ path: string; message: string }>;
  };
  draft_id: string;
  decision_revision: number;
  decisions: MergeWorkspaceDecision | null;
  source_commit_id: string;
  target_commit_id: string;
  merge_base_commit_id: string | null;
  nodes: ApiPullRequestMergeReviewNode[];
}

/** `target` keeps the base branch value, `source` takes the PR branch value. */
export type MergeSlotChoice =
  | { kind: 'target' }
  | { kind: 'source' }
  | { kind: 'custom'; text: string };

export interface MergeNodeChoice {
  /** Whole-node choice, used when one side deleted the node. */
  node?: 'target' | 'source';
  slots: Record<string, MergeSlotChoice>;
}

export type MergeChoices = Record<string, MergeNodeChoice>;

export interface MergeReviewDecision {
  decision: MergeDecision;
  unresolved: string[];
}

const stable = (value: unknown) => JSON.stringify(value);

/** One side deleted the node while the other edited it; only a whole-node choice applies. */
export function isPresenceConflict(node: ApiPullRequestMergeReviewNode): boolean {
  return node.status === 'conflict' && (!node.presence.source || !node.presence.target);
}

export function changedSlots(node: ApiPullRequestMergeReviewNode): ApiPullRequestMergeReviewSlot[] {
  return node.slots.filter(
    (slot) =>
      slot.conflict ||
      stable(slot.base) !== stable(slot.source) ||
      stable(slot.base) !== stable(slot.target)
  );
}

export function conflictSlots(node: ApiPullRequestMergeReviewNode) {
  return node.slots.filter((slot) => slot.conflict);
}

export function isNodeResolved(
  node: ApiPullRequestMergeReviewNode,
  choice: MergeNodeChoice | undefined
): boolean {
  if (node.status !== 'conflict') return true;
  if (isPresenceConflict(node)) return choice?.node !== undefined;
  return conflictSlots(node).every((slot) => choice?.slots[slot.key] !== undefined);
}

/** Text typed for a non-string slot is read as JSON when it parses, otherwise kept as text. */
export function parseCustomValue(text: string, slot: ApiPullRequestMergeReviewSlot): unknown {
  const samples = [slot.base, slot.source, slot.target].filter((value) => value !== undefined);
  if (samples.every((value) => typeof value === 'string')) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function formatSlotValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/** The value a slot takes after a choice; `undefined` means the slot is removed. */
export function chosenSlotValue(
  slot: ApiPullRequestMergeReviewSlot,
  choice: MergeSlotChoice | undefined
): { resolved: boolean; value: unknown } {
  if (!slot.conflict) return { resolved: true, value: slot.merged };
  if (!choice) return { resolved: false, value: undefined };
  if (choice.kind === 'source') return { resolved: true, value: slot.source };
  if (choice.kind === 'target') return { resolved: true, value: slot.target };
  return { resolved: true, value: parseCustomValue(choice.text, slot) };
}

function nodeResolution(
  node: ApiPullRequestMergeReviewNode,
  choice: MergeNodeChoice
): MergeResolution {
  if (isPresenceConflict(node)) return choice.node!;
  const slots: Record<string, unknown> = {};
  for (const slot of node.slots) {
    const { value } = chosenSlotValue(slot, choice.slots[slot.key]);
    if (value !== undefined) slots[slot.key] = value;
  }
  // The edit replaces only this node's own slots; child nodes merge on their own paths.
  return {
    edit: { key: node.path.split('/').at(-1)!, slots: slots as never, children: [] },
  };
}

export function buildMergeReviewDecision(
  review: Pick<ApiPullRequestMergeReview, 'nodes'>,
  choices: MergeChoices
): MergeReviewDecision {
  const conflictResolutions: Record<string, MergeResolution> = {};
  const unresolved: string[] = [];
  for (const node of review.nodes) {
    if (node.status !== 'conflict') continue;
    const choice = choices[node.path];
    if (choice && isNodeResolved(node, choice)) {
      conflictResolutions[node.path] = nodeResolution(node, choice);
    } else {
      unresolved.push(node.path);
    }
  }
  return {
    decision: {
      conflictResolutions,
      keepFromSource: review.nodes
        .filter((node) => node.status === 'source_only')
        .map((node) => node.path),
      keepFromTarget: review.nodes
        .filter((node) => node.status === 'target_only')
        .map((node) => node.path),
      keepRelationsFromSource: true,
      keepRelationsFromTarget: true,
    },
    unresolved,
  };
}

/** Rebuild editable choices from a decision saved on the merge draft. */
export function choicesFromDecision(
  review: Pick<ApiPullRequestMergeReview, 'nodes'>,
  decision: MergeDecision | null
): MergeChoices {
  const choices: MergeChoices = {};
  if (!decision) return choices;
  for (const node of review.nodes) {
    const resolution = decision.conflictResolutions[node.path];
    if (node.status !== 'conflict' || !resolution || resolution === 'both') continue;
    if (resolution === 'source' || resolution === 'target') {
      choices[node.path] = {
        ...(isPresenceConflict(node) ? { node: resolution } : {}),
        slots: Object.fromEntries(
          conflictSlots(node).map((slot) => [slot.key, { kind: resolution }])
        ),
      };
      continue;
    }
    const edited = resolution.edit.slots as Record<string, unknown>;
    choices[node.path] = {
      slots: Object.fromEntries(
        conflictSlots(node).map((slot): [string, MergeSlotChoice] => {
          const value = edited[slot.key];
          if (stable(value) === stable(slot.source)) return [slot.key, { kind: 'source' }];
          if (stable(value) === stable(slot.target)) return [slot.key, { kind: 'target' }];
          return [slot.key, { kind: 'custom', text: formatSlotValue(value) }];
        })
      ),
    };
  }
  return choices;
}

/** Apply one side to every conflict that is still open, leaving earlier choices intact. */
export function chooseSideForRemaining(
  review: Pick<ApiPullRequestMergeReview, 'nodes'>,
  choices: MergeChoices,
  side: 'target' | 'source'
): MergeChoices {
  const next: MergeChoices = { ...choices };
  for (const node of review.nodes) {
    if (node.status !== 'conflict') continue;
    const current = next[node.path] ?? { slots: {} };
    if (isPresenceConflict(node)) {
      next[node.path] = { ...current, node: current.node ?? side };
      continue;
    }
    const slots = { ...current.slots };
    for (const slot of conflictSlots(node)) slots[slot.key] ??= { kind: side };
    next[node.path] = { ...current, slots };
  }
  return next;
}
