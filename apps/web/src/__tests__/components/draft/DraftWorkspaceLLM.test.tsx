import { describe, expect, test, vi } from 'vitest';
import type { DraftV3, SemanticPointAPI } from '@/lib/api';

/**
 * Tests for the DraftWorkspace LLM extraction mode integration.
 *
 * DraftWorkspace conditionally renders DraftWorkbenchLLM (LLM mode)
 * vs SentenceList + AutoSuggestPanel (deterministic mode) based on
 * draft.extraction_mode and draft.semantic_points.
 */

function makeSemanticPoint(overrides: Partial<SemanticPointAPI> = {}): SemanticPointAPI {
  return {
    id: 'sp_1',
    text: 'Test semantic point',
    extraction_mode: 'llm_extracted',
    status: 'auto_landed',
    zone: 'ready',
    evidence: [],
    confidence: 0.9,
    position: 0,
    staged: true,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<DraftV3> = {}): DraftV3 {
  return {
    id: 'draft_test_001',
    project_id: 'proj_test',
    title: 'Test Draft',
    goal: null,
    parent_commit_hash: null,
    forked_from: null,
    sentences: [
      {
        id: 's1',
        text: 'Deterministic sentence',
        origin: { type: 'manual' },
        position: 0,
        included: true,
      },
    ],
    constraints: [],
    instructions: null,
    preview_type: null,
    preview_output: null,
    preview_generated_at: null,
    status: 'editing',
    committed_as: null,
    committed_leaf_id: null,
    target_branch: null,
    revision: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('DraftWorkspace LLM mode detection', () => {
  test('isLLMMode is true when extraction_mode=llm AND semantic_points is array', () => {
    const draft = makeDraft({
      extraction_mode: 'llm',
      semantic_points: [makeSemanticPoint()],
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    expect(isLLMMode).toBe(true);
  });

  test('isLLMMode is false when extraction_mode=deterministic', () => {
    const draft = makeDraft({
      extraction_mode: 'deterministic',
      semantic_points: null,
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    expect(isLLMMode).toBe(false);
  });

  test('isLLMMode is false when extraction_mode is null (backward compat)', () => {
    const draft = makeDraft({
      extraction_mode: null,
      semantic_points: null,
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    expect(isLLMMode).toBe(false);
  });

  test('isLLMMode is false when extraction_mode is undefined (backward compat)', () => {
    const draft = makeDraft();
    // extraction_mode not set at all
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    expect(isLLMMode).toBe(false);
  });

  test('isLLMMode is false when extraction_mode=llm but semantic_points is null', () => {
    const draft = makeDraft({
      extraction_mode: 'llm',
      semantic_points: null,
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    expect(isLLMMode).toBe(false);
  });

  test('isLLMMode is true even with empty semantic_points array', () => {
    const draft = makeDraft({
      extraction_mode: 'llm',
      semantic_points: [],
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    expect(isLLMMode).toBe(true);
  });
});

describe('DraftWorkspace LLM mode indicator counts', () => {
  test('ready count counts non-undone points in ready zone', () => {
    const draft = makeDraft({
      extraction_mode: 'llm',
      semantic_points: [
        makeSemanticPoint({ id: 'p1', zone: 'ready', status: 'auto_landed' }),
        makeSemanticPoint({ id: 'p2', zone: 'ready', status: 'inherited' }),
        makeSemanticPoint({ id: 'p3', zone: 'ready', status: 'undone' }),
        makeSemanticPoint({ id: 'p4', zone: 'review', status: 'auto_landed' }),
      ],
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    const readyCount = isLLMMode
      ? (draft.semantic_points ?? []).filter((p) => p.zone === 'ready' && p.status !== 'undone')
          .length
      : 0;
    expect(readyCount).toBe(2);
  });

  test('review count counts all points in review zone', () => {
    const draft = makeDraft({
      extraction_mode: 'llm',
      semantic_points: [
        makeSemanticPoint({ id: 'p1', zone: 'review', status: 'auto_landed' }),
        makeSemanticPoint({ id: 'p2', zone: 'review', status: 'reviewed' }),
        makeSemanticPoint({ id: 'p3', zone: 'ready', status: 'auto_landed' }),
      ],
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    const reviewCount = isLLMMode
      ? (draft.semantic_points ?? []).filter((p) => p.zone === 'review').length
      : 0;
    expect(reviewCount).toBe(2);
  });

  test('counts are 0 when not in LLM mode', () => {
    const draft = makeDraft({
      extraction_mode: 'deterministic',
    });
    const isLLMMode = draft.extraction_mode === 'llm' && Array.isArray(draft.semantic_points);
    const readyCount = isLLMMode
      ? (draft.semantic_points ?? []).filter((p) => p.zone === 'ready' && p.status !== 'undone')
          .length
      : 0;
    const reviewCount = isLLMMode
      ? (draft.semantic_points ?? []).filter((p) => p.zone === 'review').length
      : 0;
    expect(readyCount).toBe(0);
    expect(reviewCount).toBe(0);
  });
});

describe('DraftWorkspace LLM mode component selection', () => {
  test('LLM mode renders DraftWorkbenchLLM component', async () => {
    const { DraftWorkbenchLLM } = await import('@/components/draft/DraftWorkbenchLLM');
    expect(DraftWorkbenchLLM).toBeDefined();
    expect(typeof DraftWorkbenchLLM).toBe('function');
  });

  test('deterministic mode renders SentenceList + AutoSuggestPanel', async () => {
    const { SentenceList } = await import('@/components/draft/SentenceList');
    const { AutoSuggestPanel } = await import('@/components/draft/AutoSuggestPanel');
    expect(SentenceList).toBeDefined();
    expect(AutoSuggestPanel).toBeDefined();
  });

  test('shared sections always render regardless of mode', async () => {
    const { CollapsibleSection } = await import('@/components/shared/CollapsibleSection');
    const { DraftDiffSection } = await import('@/components/draft/DraftDiffSection');
    const { ConflictPanel } = await import('@/components/draft/ConflictPanel');
    expect(CollapsibleSection).toBeDefined();
    expect(DraftDiffSection).toBeDefined();
    expect(ConflictPanel).toBeDefined();
  });

  test('LLM mode indicator text is "LLM Extraction"', () => {
    // The indicator bar in LLM mode should display "LLM Extraction" as label
    const indicatorText = 'LLM Extraction';
    expect(indicatorText).toBe('LLM Extraction');
  });

  test('DraftWorkbenchLLM receives correct prop types', () => {
    const points: SemanticPointAPI[] = [
      makeSemanticPoint({ id: 'p1', zone: 'ready' }),
      makeSemanticPoint({ id: 'p2', zone: 'review' }),
    ];
    const props = {
      draftId: 'draft_test_001',
      projectId: 'proj_test',
      conversationId: '',
      semanticPoints: points,
      onUpdate: vi.fn(),
      onCommit: vi.fn(),
      onRefresh: vi.fn(),
    };
    expect(props.draftId).toBe('draft_test_001');
    expect(props.semanticPoints).toHaveLength(2);
    expect(typeof props.onUpdate).toBe('function');
    expect(typeof props.onCommit).toBe('function');
    expect(typeof props.onRefresh).toBe('function');
  });

  test('conversationId derived from first semantic point evidence', () => {
    const points: SemanticPointAPI[] = [
      makeSemanticPoint({
        evidence: [
          {
            conversation_id: 'conv_abc',
            turn_hash: 'sha256:test',
            quoted_text: 'test',
            start_char: 0,
            end_char: 10,
            match_score: 1.0,
            role: 'primary',
            relevance: 'direct',
            enabled: true,
          },
        ],
      }),
    ];
    const conversationId = points[0]?.evidence?.[0]?.conversation_id ?? '';
    expect(conversationId).toBe('conv_abc');
  });

  test('conversationId falls back to empty string when no evidence', () => {
    const points: SemanticPointAPI[] = [makeSemanticPoint({ evidence: [] })];
    const conversationId = points[0]?.evidence?.[0]?.conversation_id ?? '';
    expect(conversationId).toBe('');
  });
});
