import { describe, expect, it } from 'vitest';
import type { Lesson } from '../../feedback/types';
import { buildLeafPrompt } from '../../leaf/build-prompt';
import type { Leaf } from '../../types';

describe('buildLeafPrompt with Lesson[] support', () => {
  it('includes lessons in prompt when Lesson[] provided', () => {
    const lessons: Lesson[] = [
      {
        id: 'lsn_1',
        source: 'assertion',
        signal: 'Always include greeting',
        constraint_id: 'cst_1',
        leaf_id: 'leaf_1',
        confidence: 1.0,
        created_at: '2026-03-31T00:00:00Z',
      },
      {
        id: 'lsn_2',
        source: 'edit',
        signal: 'Keep casual tone',
        leaf_id: 'leaf_1',
        confidence: 0.8,
        created_at: '2026-03-31T00:00:00Z',
      },
    ];
    const result = buildLeafPrompt({
      knowledge: {
        trees: [{ key: 'test', slots: { text: 'hello' }, children: [] }],
        relations: [],
      },
      leaf: {
        id: 'leaf_1',
        commit_hash: 'sha256:abc',
        type: 'tweet',
        title: 'Test',
        constraints: [],
        config: {},
        output: null,
        assertions: [],
        project_id: 'proj_1',
        created_at: '2026-03-31T00:00:00Z',
      } as unknown as Leaf,
      lessons,
    });
    expect(result.userPrompt).toContain('Always include greeting');
    expect(result.userPrompt).toContain('Keep casual tone');
    expect(result.userPrompt).toContain('Lessons');
  });

  it('does not include lessons section when lessons is empty', () => {
    const result = buildLeafPrompt({
      knowledge: {
        trees: [{ key: 'test', slots: { text: 'hello' }, children: [] }],
        relations: [],
      },
      leaf: {
        id: 'leaf_1',
        commit_hash: 'sha256:abc',
        type: 'tweet',
        title: 'Test',
        constraints: [],
        config: {},
        project_id: 'proj_1',
        created_at: '2026-03-31T00:00:00Z',
      } as unknown as Leaf,
      lessons: [],
    });
    expect(result.userPrompt).not.toContain('Lessons');
  });

  it('does not include lessons section when lessons is undefined', () => {
    const result = buildLeafPrompt({
      knowledge: {
        trees: [{ key: 'test', slots: { text: 'hello' }, children: [] }],
        relations: [],
      },
      leaf: {
        id: 'leaf_1',
        commit_hash: 'sha256:abc',
        type: 'tweet',
        title: 'Test',
        constraints: [],
        config: {},
        project_id: 'proj_1',
        created_at: '2026-03-31T00:00:00Z',
      } as unknown as Leaf,
    });
    expect(result.userPrompt).not.toContain('Lessons');
  });
});
