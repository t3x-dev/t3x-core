import type {
  TransitionProtocolValue,
  WorkspaceAuthoringAction,
  WorkspaceAuthoringCard,
  WorkspaceAuthoringView,
} from '@t3x-dev/api-client';
import {
  REPOSITORY_SEMANTIC_CONTENT_DOMAIN,
  type SemanticContent,
  SemanticContentSchema,
  yamlToTree,
} from '@t3x-dev/core';
import { expandAuthoringCards } from '@/domain/composeActivity';
import type { WorkspaceCandidate, WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import type { WorkspaceYOpsValidationResult, WorkspaceYOpsValue } from '@/types/workspaceYops';
import { composeValuesEqual } from './composeObjectChanges';

export function generatedActionReasons(action: WorkspaceAuthoringAction): string[] {
  const preparation = action.generation?.preparation;
  if (!preparation || typeof preparation !== 'object' || !('bindings' in preparation)) return [];
  if (!Array.isArray(preparation.bindings)) return [];
  return [
    ...new Set(
      preparation.bindings.flatMap((binding) =>
        binding &&
        typeof binding === 'object' &&
        typeof binding.reason === 'string' &&
        binding.reason.trim()
          ? [binding.reason]
          : []
      )
    ),
  ];
}

export function authoringSemanticContent(value: unknown): SemanticContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (document.domain !== REPOSITORY_SEMANTIC_CONTENT_DOMAIN) return null;
  const content = document.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const semantic = content as Record<string, unknown>;
  if (!Array.isArray(semantic.trees) || !Array.isArray(semantic.relations)) return null;
  return { trees: semantic.trees, relations: semantic.relations } as SemanticContent;
}

function reviewSemanticContent(value: TransitionProtocolValue | undefined): SemanticContent | null {
  const semantic = authoringSemanticContent(value);
  if (semantic) return semantic;

  // Older generated drafts saved the semantic tree without its document markers.
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 1) return null;
  const content = value.content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  if (Object.keys(content).some((key) => key !== 'trees' && key !== 'relations')) return null;
  const { trees, relations = [] } = content;
  if (!Array.isArray(trees)) return null;
  const normalized = { trees, relations };
  const parsed = SemanticContentSchema.safeParse(normalized);
  if (!parsed.success || !composeValuesEqual(normalized, parsed.data as TransitionProtocolValue))
    return null;
  return parsed.data as SemanticContent;
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
  view:
    | (Pick<WorkspaceAuthoringView, 'base' | 'current'> &
        Partial<Pick<WorkspaceAuthoringView, 'selected'>>)
    | null
    | undefined
): {
  baseline: SemanticContent;
  current: SemanticContent;
} | null {
  if (!view) return null;
  // This is a display projection only. Review still freezes and replays the
  // original document on the server; ordinary YAML never gains envelope paths.
  const project = (value: TransitionProtocolValue | undefined): SemanticContent | null => {
    const semantic = reviewSemanticContent(value);
    if (semantic) return semantic;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if ((value as Record<string, unknown>).domain === REPOSITORY_SEMANTIC_CONTENT_DOMAIN)
      return null;
    return {
      trees: Object.entries(value).map(([key, item]) => yamlToTree(key, item)),
      relations: [],
    };
  };
  const baseline = project(view.selected?.before ?? view.base);
  const current = project(view.selected?.after ?? view.current);
  return baseline && current ? { baseline, current } : null;
}

export function authoringVisibleCards(cards: readonly WorkspaceAuthoringCard[]) {
  return cards.filter((card) => card.path !== 'content');
}

export function authoringReviewOperations(
  cards: readonly WorkspaceAuthoringCard[],
  ordinaryYaml = false
): WorkspaceYOpsDraftOperation[] {
  return cards.flatMap((card, index): WorkspaceYOpsDraftOperation[] => {
    const path = ordinaryYaml
      ? card.path
      : (authoringSemanticPath(card.path) ??
        (isAuthoringEnvelopePath(card.path) ? card.path : null));
    if (!path || (!ordinaryYaml && path === 'content')) return [];
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
  const operations = authoringReviewOperations(
    expandAuthoringCards(view.selected?.cards ?? view.netDiff),
    !reviewSemanticContent(view.selected?.after ?? view.current)
  );
  return {
    candidate: {
      ...candidate,
      revision: view.workspaceRevision,
      baseCommitHash: view.basis.refHead,
      targetBranch: view.basis.refName,
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
