import { describe, expect, it } from 'vitest';
import { structuralValidatorAgent } from '../../extractors/agents/structuralValidatorAgent';
import type { PipelineContext } from '../../extractors/meaningPipeline';
import type { SemanticContent } from '../../semantic/types';
import { checkDiffCompatibility } from '../diffCompatibilityCheck';

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
      frameCount: content.trees.length,
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
      trees: [
        { key: 'travel_plan', slots: { destination: 'Hangzhou' }, children: [] },
        { key: 'budget', slots: { amount: 5000 }, children: [] },
      ],
      relations: [{ from: 'travel_plan', to: 'budget', type: 'depends' }],
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
      trees: [
        { key: 'a', slots: { x: 1 }, children: [] },
        { key: 'a', slots: { y: 2 }, children: [] },
      ],
      relations: [],
    };
    const ctx = makePipelineContext(content);
    const result = await structuralValidatorAgent.run(ctx, {} as any);
    const errors = result.meta.agentErrors.filter(
      (e) => e.agent === 'structural_validator' && e.error.includes('duplicate_key')
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('records error for broken relation endpoint', async () => {
    const content: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [{ from: 'a', to: 'f_999', type: 'depends' }],
    };
    const ctx = makePipelineContext(content);
    const result = await structuralValidatorAgent.run(ctx, {} as any);
    const errors = result.meta.agentErrors.filter(
      (e) => e.agent === 'structural_validator' && e.error.includes('broken_relation')
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('skips when no trees', () => {
    const ctx = makePipelineContext({ trees: [], relations: [] });
    expect(structuralValidatorAgent.shouldRun(ctx)).toBe(false);
  });

  it('does not modify content (non-destructive)', async () => {
    const content: SemanticContent = {
      trees: [
        { key: 'a', slots: { x: 1 }, children: [] },
        { key: 'a', slots: { y: 2 }, children: [] },
      ],
      relations: [],
    };
    const ctx = makePipelineContext(content);
    const result = await structuralValidatorAgent.run(ctx, {} as any);
    // Content unchanged — validator only reports, never modifies
    expect(result.content.trees).toHaveLength(2);
  });
});

// ── DiffCompatibilityCheck ──

describe('checkDiffCompatibility', () => {
  it('returns compatible for clean add delta', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'add' as const, parent_path: 'a', node: { key: 'b', slots: { y: 2 }, children: [] } }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns compatible for clean update delta', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'update' as const, target_path: 'a', slots: { x: 2 } }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
  });

  it('returns compatible for remove delta', () => {
    const snapshot: SemanticContent = {
      trees: [
        { key: 'a', slots: { x: 1 }, children: [
          { key: 'b', slots: { y: 2 }, children: [] },
        ] },
      ],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'remove' as const, target_path: 'a/b' }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
  });

  it('detects broken relation after delta apply', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'add' as const, parent_path: 'a', node: { key: 'b', slots: { y: 2 }, children: [] } }],
      new_relations: [{ from: 'b', to: 'f_999', type: 'depends' as const }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.includes('broken_relation'))).toBe(true);
  });

  it('detects self-relation after delta apply', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const delta = {
      changes: [{ action: 'add' as const, parent_path: 'a', node: { key: 'b', slots: { y: 2 }, children: [] } }],
      new_relations: [{ from: 'b', to: 'b', type: 'depends' as const }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.includes('self_relation'))).toBe(true);
  });

  it('handles empty snapshot + add delta', () => {
    const snapshot: SemanticContent = { trees: [], relations: [] };
    const delta = {
      changes: [{ action: 'add' as const, parent_path: '', node: { key: 'a', slots: { x: 1 }, children: [] } }],
    };
    const result = checkDiffCompatibility(snapshot, delta);
    expect(result.compatible).toBe(true);
  });
});
