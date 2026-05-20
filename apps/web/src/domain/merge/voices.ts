import type { MergeResult, SemanticContent, SlotValue, TreeNode } from '@t3x-dev/core';

export type MergeVoiceKind = 'agreements' | 'unique_to_source' | 'unique_to_target' | 'tension';

export interface MergeVoiceExample {
  path: string;
  label: string;
  reason: string;
  sourceQuote?: string;
  targetQuote?: string;
}

export interface MergeVoiceSection {
  kind: MergeVoiceKind;
  title: string;
  description: string;
  count: number;
  examples: MergeVoiceExample[];
}

export interface MergeDecisionLabels {
  source: string;
  target: string;
  both: string;
  edit: string;
}

interface BuildMergeVoicesInput {
  mergeResult: MergeResult;
  sourceContent?: SemanticContent | null;
  targetContent?: SemanticContent | null;
  sourceBranch?: string | null;
  targetBranch?: string | null;
  exampleLimit?: number;
}

const DEFAULT_EXAMPLE_LIMIT = 3;
const QUOTE_LIMIT = 96;

function pathLabel(path: string): string {
  return path.split('/').filter(Boolean).at(-1) || path;
}

function humanBranchName(branch: string | null | undefined, fallback: string): string {
  const clean = branch?.trim();
  if (!clean) return fallback;
  return clean.replace(/^refs\/heads\//, '');
}

function truncate(text: string, max = QUOTE_LIMIT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function quoteSlotValue(value: SlotValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return truncate(JSON.stringify(value));
}

function findNodeByPath(trees: TreeNode[] | undefined, path: string): TreeNode | null {
  if (!trees) return null;
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  let current: TreeNode | undefined;
  let children = trees;
  for (const part of parts) {
    current = children.find((node) => node.key === part);
    if (!current) return null;
    children = current.children;
  }
  return current ?? null;
}

function quoteNode(node: TreeNode | null): string | undefined {
  if (!node) return undefined;
  const firstSlot = Object.entries(node.slots)[0];
  if (!firstSlot) return node.key;
  const [key, value] = firstSlot;
  const quoted = quoteSlotValue(value);
  return quoted ? `${key}: ${quoted}` : key;
}

export function buildMergeDecisionLabels({
  sourceBranch,
  targetBranch,
}: {
  sourceBranch?: string | null;
  targetBranch?: string | null;
}): MergeDecisionLabels {
  return {
    source: `Use ${humanBranchName(sourceBranch, 'source')}`,
    target: `Use ${humanBranchName(targetBranch, 'target')}`,
    both: 'Keep both voices',
    edit: 'Edit voice',
  };
}

export function buildMergeVoices({
  mergeResult,
  sourceContent,
  targetContent,
  sourceBranch,
  targetBranch,
  exampleLimit = DEFAULT_EXAMPLE_LIMIT,
}: BuildMergeVoicesInput): MergeVoiceSection[] {
  const sourceName = humanBranchName(sourceBranch, 'source');
  const targetName = humanBranchName(targetBranch, 'target');

  const examplesForPaths = (
    paths: string[],
    side: 'source' | 'target' | 'both'
  ): MergeVoiceExample[] =>
    paths.slice(0, exampleLimit).map((path) => {
      const sourceNode = findNodeByPath(sourceContent?.trees, path);
      const targetNode = findNodeByPath(targetContent?.trees, path);
      return {
        path,
        label: pathLabel(path),
        reason:
          side === 'both'
            ? 'Both voices already carry this meaning.'
            : side === 'source'
              ? `Only ${sourceName} carries this meaning.`
              : `Only ${targetName} carries this meaning.`,
        sourceQuote: side !== 'target' ? quoteNode(sourceNode) : undefined,
        targetQuote: side !== 'source' ? quoteNode(targetNode) : undefined,
      };
    });

  const tensionExamples = mergeResult.conflicts.slice(0, exampleLimit).map((conflict) => {
    const firstSlot = conflict.slotConflicts[0];
    return {
      path: conflict.path,
      label: pathLabel(conflict.path),
      reason: firstSlot
        ? `Slot "${firstSlot.key}" differs between voices.`
        : 'The two voices describe the same node differently.',
      sourceQuote: quoteSlotValue(firstSlot?.sourceValue),
      targetQuote: quoteSlotValue(firstSlot?.targetValue),
    };
  });

  return [
    {
      kind: 'agreements',
      title: 'Agreements',
      description: 'Meaning both branches already share.',
      count: mergeResult.autoKept.length,
      examples: examplesForPaths(mergeResult.autoKept, 'both'),
    },
    {
      kind: 'unique_to_source',
      title: `Unique to ${sourceName}`,
      description: `Meaning present only in ${sourceName}.`,
      count: mergeResult.onlyInSource.length,
      examples: examplesForPaths(mergeResult.onlyInSource, 'source'),
    },
    {
      kind: 'unique_to_target',
      title: `Unique to ${targetName}`,
      description: `Meaning present only in ${targetName}.`,
      count: mergeResult.onlyInTarget.length,
      examples: examplesForPaths(mergeResult.onlyInTarget, 'target'),
    },
    {
      kind: 'tension',
      title: 'Tension requiring judgment',
      description: 'Similar meaning changed in ways that need an explicit choice.',
      count: mergeResult.conflicts.length,
      examples: tensionExamples,
    },
  ];
}
