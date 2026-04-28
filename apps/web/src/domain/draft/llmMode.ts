import type { SemanticPointAPI, WorkbenchDraft } from '@/types/api';

type DraftLLMFields = Pick<WorkbenchDraft, 'extraction_mode' | 'semantic_points'>;

export function isLLMExtractionDraft(
  draft: DraftLLMFields | null | undefined
): draft is DraftLLMFields & { extraction_mode: 'llm'; semantic_points: SemanticPointAPI[] } {
  return draft?.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
}

export function countReadySemanticPoints(points: readonly SemanticPointAPI[] | null | undefined) {
  return (points ?? []).filter((point) => point.zone === 'ready' && point.status !== 'undone')
    .length;
}

export function countReviewSemanticPoints(points: readonly SemanticPointAPI[] | null | undefined) {
  return (points ?? []).filter((point) => point.zone === 'review').length;
}

export function getSemanticPointsConversationId(
  points: readonly SemanticPointAPI[] | null | undefined
) {
  return points?.[0]?.evidence?.[0]?.conversation_id ?? '';
}
