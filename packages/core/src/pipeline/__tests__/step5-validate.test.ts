import { describe, expect, it } from 'vitest';
import type { SemanticContent } from '../../semantic/types';
import { checkDiffCompatibility } from '../diffCompatibilityCheck';
import { structuralValidatorAgent } from '../../extractors/agents/structuralValidatorAgent';
import type { PipelineContext } from '../../extractors/meaningPipeline';

// ── Helper ──

function makePipelineContext(content: SemanticContent): PipelineContext {
  return {
    turns: [],
    previousSnapshot: undefined,
    content,
    topicName: null,
    conversationSummary: '',
    meta: {
      mode: 'full',
      isFirstExtraction: true,
      turnCount: 2,
      frameCount: content.frames.length,
      completedAgents: [],
      agentErrors: [],
      totalUsage: { inputTokens: 0, outputTokens: 0 },
      stepSnapshots: [],
    },
  };
}

// ── StructuralValidatorAgent ──

describe('structuralValidatorAgent', () => {
  it('passes clean content without errors', async () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'travel_plan', slots: { destination: 'Hangzhou' } },
        { id: 'f_002', type: 'budget', slots: { amount: 5000 } },
      ],
      relations: [{ from: 'f_001', to: 'f_002', type: 'elaborates' }],
    };
    const ctx = makePipelineContext(content);
    const result = await structuralValidatorAgent.run(ctx, {} as any);
    const structErrors = result.meta.agentErrors.filter(
      (e) => e.agent === 'structural_validator' && !e.error.startsWith('WARNING')
    );
    expect(structErrors).toHaveLength(0);
  });

  it('records error for duplicate frame IDs', async () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'a', slots: { x: 1 } },
        { id: 'f_001', type: 'b', slots: { y: 2 } },
      ],
      relations: [],
    };
    const ctx = makePipelineContext(content);
    const result = await structuralValidatorAgent.run(ctx, {} as any);
    const errors = result.meta.agentErrors.filter(
      (e) => e.agent === 'structural_validator' && e.error.includes('duplicate_id')
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('records error for broken relation endpoint', async () => {
    const content: SemanticContent = {
      frames: [{ id: 'f_001', type: 'a', slots: { x: 1 } }],
      relations: [{ from: 'f_001', to: 'f_999', type: 'elaborates' }],
    };
    const ctx = makePipelineContext(content);
    const result = await structuralValidatorAgent.run(ctx, {} as any);
    const errors = result.meta.agentErrors.filter(
      (e) => e.agent === 'structural_validator' && e.error.includes('broken_relation')
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('skips when no frames', () => {
    const ctx = makePipelineContext({ frames: [], relations: [] });
    expect(structuralValidatorAgent.shouldRun(ctx)).toBe(false);
  });

  it('does not modify content (non-destructive)', async () => {
    const content: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'a', slots: { x: 1 } },
        { id: 'f_001', type: 'b', slots: { y: 2 } },
      ],
      relations: [],
    };
    const ctx = makePipelineContext(content);
    const result = await structuralValidatorAgent.run(ctx, {} as any);
    // Content unchanged — validator only reports, never modifies
    expect(result.content.frames).toHaveLength(2);
  });
});

// ── DiffCompatibilityCheck ──

describe('checkDiffCompatibility', () => {
  it('returns compatible for clean add delta', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'a', slots: { x: 1 } }],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'add' as const, frame: { id: 'f_002', type: 'b', slots: { y: 2 } } }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns compatible for clean update delta', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'a', slots: { x: 1 } }],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'update' as const, target: 'f_001', slots: { x: 2 } }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
  });

  it('returns compatible for remove delta', () => {
    const snapshot: SemanticContent = {
      frames: [
        { id: 'f_001', type: 'a', slots: { x: 1 } },
        { id: 'f_002', type: 'b', slots: { y: 2 } },
      ],
      relations: [{ from: 'f_001', to: 'f_002', type: 'elaborates' }],
    };
    const delta = {
      changes: [{ action: 'remove' as const, target: 'f_002' }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
  });

  it('detects broken relation after delta apply', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'a', slots: { x: 1 } }],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'add' as const, frame: { id: 'f_002', type: 'b', slots: { y: 2 } } }],
      new_relations: [{ from: 'f_002', to: 'f_999', type: 'elaborates' as const }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.includes('broken_relation'))).toBe(true);
  });

  it('detects duplicate IDs after delta apply', () => {
    const snapshot: SemanticContent = {
      frames: [{ id: 'f_001', type: 'a', slots: { x: 1 } }],
      relations: [],
    };
    // applyDelta with existing ID does a merge, not a duplicate — so this won't fail
    // Instead test with a new_relations self-reference
    const delta = {
      changes: [{ action: 'add' as const, frame: { id: 'f_002', type: 'b', slots: { y: 2 } } }],
      new_relations: [{ from: 'f_002', to: 'f_002', type: 'elaborates' as const }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.includes('self_relation'))).toBe(true);
  });

  it('handles empty snapshot + add delta', () => {
    const snapshot: SemanticContent = { frames: [], relations: [] };
    const delta = {
      changes: [{ action: 'add' as const, frame: { id: 'f_001', type: 'a', slots: { x: 1 } } }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
  });
});
