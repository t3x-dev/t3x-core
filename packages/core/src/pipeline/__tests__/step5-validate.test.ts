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

// ── DiffCompatibilityCheck (now uses YOps) ──

describe('checkDiffCompatibility', () => {
  it('returns compatible for clean add YOp', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const yops = [{ add: { parent: 'a', node: { b: { y: 2 } }, source: {}, from: 'T1' } }];
    const result = checkDiffCompatibility(snapshot, yops);
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns compatible for clean set YOp', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const yops = [{ set: { path: 'a/x', value: 2, source: '2', from: 'T1' } }];
    const result = checkDiffCompatibility(snapshot, yops);
    expect(result.compatible).toBe(true);
  });

  it('returns compatible for drop YOp', () => {
    const snapshot: SemanticContent = {
      trees: [
        { key: 'a', slots: { x: 1 }, children: [
          { key: 'b', slots: { y: 2 }, children: [] },
        ] },
      ],
      relations: [],
    };
    const yops = [{ drop: { path: 'a/b' } }];
    const result = checkDiffCompatibility(snapshot, yops);
    expect(result.compatible).toBe(true);
  });

  it('detects broken relation after YOps apply', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const yops = [
      { add: { parent: 'a', node: { b: { y: 2 } }, source: {}, from: 'T1' } },
      { relate: { from: 'b', to: 'f_999', type: 'depends' as const } },
    ];
    const result = checkDiffCompatibility(snapshot, yops);
    // relate to non-existent node should fail during applyYOps
    expect(result.compatible).toBe(false);
  });

  it('detects self-relation after YOps apply', () => {
    const snapshot: SemanticContent = {
      trees: [{ key: 'a', slots: { x: 1 }, children: [] }],
      relations: [],
    };
    const yops = [
      { add: { parent: 'a', node: { b: { y: 2 } }, source: {}, from: 'T1' } },
      { relate: { from: 'a/b', to: 'a/b', type: 'depends' as const } },
    ];
    const result = checkDiffCompatibility(snapshot, yops);
    expect(result.compatible).toBe(false);
  });

  it('handles empty snapshot + add YOp', () => {
    const snapshot: SemanticContent = { trees: [], relations: [] };
    const yops = [{ add: { parent: '', node: { a: { x: 1 } }, source: {}, from: 'T1' } }];
    const result = checkDiffCompatibility(snapshot, yops);
    expect(result.compatible).toBe(true);
  });
});
