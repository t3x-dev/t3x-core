import type { WorkspaceAuthoringCard, WorkspaceAuthoringView } from '@t3x-dev/api-client';
import type { SemanticContent } from '@t3x-dev/core';
import type { WorkspaceCandidate, WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import type { WorkspaceYOpsValidationResult, WorkspaceYOpsValue } from '@/types/workspaceYops';

export const EMPTY_AUTHORING_SEMANTIC_CONTENT: SemanticContent = Object.freeze({
  trees: [],
  relations: [],
});

export function authoringSemanticContent(value: unknown): SemanticContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (document.domain !== 't3x.dev/semantic-content') return null;
  const content = document.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const semantic = content as Record<string, unknown>;
  if (!Array.isArray(semantic.trees) || !Array.isArray(semantic.relations)) return null;
  return { trees: semantic.trees, relations: semantic.relations } as SemanticContent;
}

export function authoringSemanticPath(path: string): string | null {
  if (!path.startsWith('content/trees/')) return null;
  const keys = [...path.matchAll(/\[key=(?:"([^"]+)"|([^\]]+))\]/g)].map(
    (match) => match[1] ?? match[2]
  );
  const slot = path.match(/\/slots\/(.+)$/)?.[1];
  if (slot) keys.push(slot.replace(/^"|"$/g, ''));
  return keys.length ? keys.join('/') : null;
}

export function isAuthoringEnvelopePath(path: string): boolean {
  return path === 'domain' || path === 'version' || path === 'content';
}

export function authoringReviewDocuments(
  view: Pick<WorkspaceAuthoringView, 'base' | 'current'> | null | undefined
): {
  baseline: SemanticContent;
  current: SemanticContent;
} | null {
  if (!view) return null;
  const current = authoringSemanticContent(view.current);
  if (!current) return null;
  return {
    baseline: authoringSemanticContent(view.base) ?? EMPTY_AUTHORING_SEMANTIC_CONTENT,
    current,
  };
}

export function authoringVisibleCards(cards: readonly WorkspaceAuthoringCard[]) {
  return cards.filter((card) => card.path !== 'content');
}

export function authoringReviewOperations(
  cards: readonly WorkspaceAuthoringCard[]
): WorkspaceYOpsDraftOperation[] {
  return cards.flatMap((card, index): WorkspaceYOpsDraftOperation[] => {
    const path =
      authoringSemanticPath(card.path) ?? (isAuthoringEnvelopePath(card.path) ? card.path : null);
    if (!path || path === 'content') return [];
    return [
      {
        id: card.nodeId || `authoring-change-${String(index + 1)}`,
        op: card.after === undefined ? 'unset' : 'set',
        path,
        beforeValue: card.before as WorkspaceYOpsValue | undefined,
        afterValue: card.after as WorkspaceYOpsValue | undefined,
        summary: `Change ${path}`,
      },
    ];
  });
}

export function authoringDeterministicValidation(
  documents: { baseline: SemanticContent; current: SemanticContent },
  applied: number
): WorkspaceYOpsValidationResult {
  return {
    ok: true,
    applied,
    yops: [],
    baselineTrees: documents.baseline.trees as WorkspaceYOpsValidationResult['baselineTrees'],
    baselineRelations: documents.baseline.relations,
    previewTrees: documents.current.trees as WorkspaceYOpsValidationResult['previewTrees'],
    previewRelations: documents.current.relations,
  };
}

export function buildAuthoringReviewProjection<
  TReview extends {
    content: unknown;
    deterministicValidation: WorkspaceYOpsValidationResult | null;
  },
>(
  candidate: WorkspaceCandidate,
  view: WorkspaceAuthoringView | null | undefined,
  review: TReview
): { candidate: WorkspaceCandidate; review: TReview } | null {
  const documents = authoringReviewDocuments(view);
  if (!view || !documents) return null;
  const operations = authoringReviewOperations(view.netDiff);
  return {
    candidate: {
      ...candidate,
      revision: view.workspaceRevision,
      yopsDraft: {
        ...candidate.yopsDraft,
        id: `${candidate.yopsDraft.id}:authoring:${String(view.compositionRevision)}`,
        operations,
      },
    },
    review: {
      ...review,
      content: documents.current as TReview['content'],
      deterministicValidation: authoringDeterministicValidation(documents, operations.length),
    },
  };
}
