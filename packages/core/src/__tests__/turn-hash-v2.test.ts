import { describe, expect, it } from 'vitest';
import { computeTurnHash } from '../storage/utils';

const baseTurnData = {
  parent_turn_hash: null,
  project_id: 'proj_test',
  conversation_id: 'conv_test',
  role: 'user',
  content: 'hello world',
  language: null,
  rings_json: null,
  created_at: '2025-01-01T00:00:00Z',
};

describe('computeTurnHash v2', () => {
  it('produces same hash as v1 when content_blocks is null', () => {
    const v1Hash = computeTurnHash(baseTurnData);
    const v2Hash = computeTurnHash({ ...baseTurnData, content_blocks: null });
    expect(v2Hash).toBe(v1Hash);
  });

  it('produces same hash as v1 when content_blocks is undefined', () => {
    const v1Hash = computeTurnHash(baseTurnData);
    const v2Hash = computeTurnHash({ ...baseTurnData, content_blocks: undefined });
    expect(v2Hash).toBe(v1Hash);
  });

  it('produces same hash as v1 when content_blocks is empty array', () => {
    const v1Hash = computeTurnHash(baseTurnData);
    const v2Hash = computeTurnHash({ ...baseTurnData, content_blocks: [] });
    expect(v2Hash).toBe(v1Hash);
  });

  it('produces different hash when content_blocks is present', () => {
    const v1Hash = computeTurnHash(baseTurnData);
    const v2Hash = computeTurnHash({
      ...baseTurnData,
      content_blocks: [{ type: 'text', text: 'hello world' }],
    });
    expect(v2Hash).not.toBe(v1Hash);
    expect(v2Hash).toMatch(/^sha256:/);
  });

  it('is deterministic', () => {
    const blocks = [{ type: 'image', url: '/img.png', alt: 'test' }];
    const hash1 = computeTurnHash({ ...baseTurnData, content_blocks: blocks });
    const hash2 = computeTurnHash({ ...baseTurnData, content_blocks: blocks });
    expect(hash1).toBe(hash2);
  });

  it('different blocks produce different hashes', () => {
    const hash1 = computeTurnHash({
      ...baseTurnData,
      content_blocks: [{ type: 'text', text: 'alpha' }],
    });
    const hash2 = computeTurnHash({
      ...baseTurnData,
      content_blocks: [{ type: 'text', text: 'beta' }],
    });
    expect(hash1).not.toBe(hash2);
  });
});
