import { describe, expect, it } from 'vitest';
import { upgradeLegacyCommit } from '../../commit/legacy';
import { COMMIT_SCHEMA } from '../../commit/types';

describe('upgradeLegacyCommit', () => {
  it('converts sentence-based commit to frame-based', () => {
    const legacy = {
      hash: 'sha256:abc',
      schema: 't3x/commit/v4',
      parents: [],
      author: { type: 'human', name: 'User' },
      committed_at: '2026-01-01T00:00:00Z',
      content: {
        sentences: [
          { id: 's_001', text: 'The destination is Tokyo', confidence: 0.9 },
          { id: 's_002', text: 'Budget is 5000 dollars' },
        ],
      },
      project_id: 'proj_123',
      message: 'test commit',
      branch: 'main',
      source_refs: [{ type: 'conversation', id: 'conv_456' }],
      semantic: null,
    };

    const result = upgradeLegacyCommit(legacy);

    expect(result.schema).toBe(COMMIT_SCHEMA);
    expect(result.hash).toBe('sha256:abc');
    expect(result.content.frames).toHaveLength(2);
    expect(result.content.frames[0].type).toBe('legacy_sentence');
    expect(result.content.frames[0].slots.text).toBe('The destination is Tokyo');
    expect(result.content.frames[0].id).toBe('f_001');
    expect(result.content.frames[0].confidence).toBe(0.9);
    expect(result.content.relations).toEqual([]);
    expect(result.sources).toEqual([{ type: 'conversation', id: 'conv_456' }]);
  });

  it('uses semantic frames when available', () => {
    const legacy = {
      hash: 'sha256:def',
      schema: 't3x/commit/v4',
      parents: [],
      author: { type: 'human', name: 'User' },
      committed_at: '2026-01-01T00:00:00Z',
      content: { sentences: [{ id: 's_001', text: 'test' }] },
      project_id: 'proj_123',
      message: null,
      branch: 'main',
      source_refs: null,
      semantic: {
        frames: [{ id: 'f_001', type: 'trip_plan', slots: { destination: 'Tokyo' } }],
        relations: [{ from: 'f_001', to: 'f_002', type: 'causes' as const }],
      },
    };

    const result = upgradeLegacyCommit(legacy);
    expect(result.content.frames[0].type).toBe('trip_plan');
    expect(result.content.frames[0].slots.destination).toBe('Tokyo');
    expect(result.content.relations).toHaveLength(1);
  });

  it('passes through current-schema commits unchanged', () => {
    const current = {
      hash: 'sha256:ghi',
      schema: COMMIT_SCHEMA,
      parents: [],
      author: { type: 'human', name: 'User' },
      committed_at: '2026-01-01T00:00:00Z',
      content: {
        frames: [{ id: 'f_001', type: 'trip_plan', slots: { destination: 'Tokyo' } }],
        relations: [],
      },
      project_id: 'proj_123',
      message: null,
      branch: 'main',
      sources: null,
      provenance: null,
    };

    const result = upgradeLegacyCommit(current);
    expect(result).toEqual(current);
  });

  it('handles empty content gracefully', () => {
    const empty = {
      hash: 'sha256:empty',
      schema: 't3x/commit/v4',
      parents: [],
      author: { type: 'human' },
      committed_at: '2026-01-01T00:00:00Z',
      content: {},
      project_id: 'proj_123',
      message: null,
      branch: 'main',
      semantic: null,
    };

    const result = upgradeLegacyCommit(empty);
    expect(result.content.frames).toEqual([]);
    expect(result.content.relations).toEqual([]);
  });
});
