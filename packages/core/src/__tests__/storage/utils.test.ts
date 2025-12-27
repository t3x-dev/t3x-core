/**
 * Storage Utils Tests
 *
 * Tests for ID generation, timestamps, and hash computation utilities.
 */

import { describe, expect, it } from 'vitest';
import {
  computeCommitHash,
  computeJCSHash,
  computeTextHash,
  computeTurnHash,
  generateBranchId,
  generateConversationId,
  generateDraftId,
  generateMergeResultId,
  generateProjectId,
  isoNow,
} from '../../storage/utils';

describe('Storage Utils', () => {
  describe('ID Generation', () => {
    describe('generateProjectId', () => {
      it('generates ID with proj_ prefix', () => {
        const id = generateProjectId();
        expect(id).toMatch(/^proj_[a-f0-9]{8}$/);
      });

      it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateProjectId()));
        expect(ids.size).toBe(100);
      });
    });

    describe('generateConversationId', () => {
      it('generates ID with conv_ prefix', () => {
        const id = generateConversationId();
        expect(id).toMatch(/^conv_[a-f0-9]{8}$/);
      });

      it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateConversationId()));
        expect(ids.size).toBe(100);
      });
    });

    describe('generateBranchId', () => {
      it('generates ID with branch_ prefix', () => {
        const id = generateBranchId();
        expect(id).toMatch(/^branch_[a-f0-9]{8}$/);
      });

      it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateBranchId()));
        expect(ids.size).toBe(100);
      });
    });

    describe('generateDraftId', () => {
      it('generates ID with draft_ prefix', () => {
        const id = generateDraftId();
        expect(id).toMatch(/^draft_[a-f0-9]{8}$/);
      });

      it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateDraftId()));
        expect(ids.size).toBe(100);
      });
    });

    describe('generateMergeResultId', () => {
      it('generates ID with merge_ prefix', () => {
        const id = generateMergeResultId();
        expect(id).toMatch(/^merge_[a-f0-9]{8}$/);
      });

      it('generates unique IDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateMergeResultId()));
        expect(ids.size).toBe(100);
      });
    });
  });

  describe('Timestamps', () => {
    describe('isoNow', () => {
      it('returns ISO 8601 formatted timestamp', () => {
        const ts = isoNow();
        expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });

      it('returns timestamp close to current time', () => {
        const before = Date.now();
        const ts = isoNow();
        const after = Date.now();

        const tsMs = new Date(ts).getTime();
        expect(tsMs).toBeGreaterThanOrEqual(before);
        expect(tsMs).toBeLessThanOrEqual(after);
      });

      it('ends with Z (UTC)', () => {
        const ts = isoNow();
        expect(ts.endsWith('Z')).toBe(true);
      });
    });
  });

  describe('Hash Computation', () => {
    describe('computeJCSHash', () => {
      it('returns sha256: prefixed hash', () => {
        const hash = computeJCSHash({ key: 'value' });
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('produces same hash for identical data', () => {
        const data = { name: 'test', value: 123 };
        const hash1 = computeJCSHash(data);
        const hash2 = computeJCSHash(data);
        expect(hash1).toBe(hash2);
      });

      it('produces same hash regardless of key order', () => {
        const hash1 = computeJCSHash({ a: 1, b: 2 });
        const hash2 = computeJCSHash({ b: 2, a: 1 });
        expect(hash1).toBe(hash2);
      });

      it('produces different hash for different data', () => {
        const hash1 = computeJCSHash({ key: 'value1' });
        const hash2 = computeJCSHash({ key: 'value2' });
        expect(hash1).not.toBe(hash2);
      });

      it('handles nested objects', () => {
        const data = { outer: { inner: { deep: 'value' } } };
        const hash = computeJCSHash(data);
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('handles arrays', () => {
        const data = { items: [1, 2, 3] };
        const hash = computeJCSHash(data);
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('handles null values', () => {
        const data = { key: null };
        const hash = computeJCSHash(data);
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('handles empty object', () => {
        const hash = computeJCSHash({});
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });
    });

    describe('computeTurnHash', () => {
      it('computes hash for turn data', () => {
        const turnData = {
          parent_turn_hash: null,
          project_id: 'proj_12345678',
          conversation_id: 'conv_12345678',
          role: 'user',
          content: 'Hello world',
          language: 'en',
          rings_json: null,
          created_at: '2024-01-01T00:00:00.000Z',
        };

        const hash = computeTurnHash(turnData);
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('produces same hash for identical turn data', () => {
        const turnData = {
          parent_turn_hash: null,
          project_id: 'proj_12345678',
          conversation_id: 'conv_12345678',
          role: 'user',
          content: 'Hello world',
          language: null,
          rings_json: null,
          created_at: '2024-01-01T00:00:00.000Z',
        };

        const hash1 = computeTurnHash(turnData);
        const hash2 = computeTurnHash(turnData);
        expect(hash1).toBe(hash2);
      });

      it('produces different hash for different content', () => {
        const base = {
          parent_turn_hash: null,
          project_id: 'proj_12345678',
          conversation_id: 'conv_12345678',
          role: 'user',
          language: null,
          rings_json: null,
          created_at: '2024-01-01T00:00:00.000Z',
        };

        const hash1 = computeTurnHash({ ...base, content: 'Hello' });
        const hash2 = computeTurnHash({ ...base, content: 'World' });
        expect(hash1).not.toBe(hash2);
      });

      it('includes parent_turn_hash in computation', () => {
        const base = {
          project_id: 'proj_12345678',
          conversation_id: 'conv_12345678',
          role: 'user',
          content: 'Hello',
          language: null,
          rings_json: null,
          created_at: '2024-01-01T00:00:00.000Z',
        };

        const hash1 = computeTurnHash({ ...base, parent_turn_hash: null });
        const hash2 = computeTurnHash({ ...base, parent_turn_hash: 'sha256:abc' });
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('computeCommitHash', () => {
      it('computes hash for commit data', () => {
        const commitData = {
          project_id: 'proj_12345678',
          branch: 'main',
          parents_json: '[]',
          turn_window_json: '{"start":"sha256:abc","end":"sha256:def"}',
          facet_snapshot_json: '[]',
          pipeline_config_json: null,
          draft_id: null,
          draft_text_hash: null,
          signature_json: null,
          created_at: '2024-01-01T00:00:00.000Z',
        };

        const hash = computeCommitHash(commitData);
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('produces same hash for identical commit data', () => {
        const commitData = {
          project_id: 'proj_12345678',
          branch: 'main',
          parents_json: '[]',
          turn_window_json: '{}',
          facet_snapshot_json: '[]',
          pipeline_config_json: null,
          draft_id: null,
          draft_text_hash: null,
          signature_json: null,
          created_at: '2024-01-01T00:00:00.000Z',
        };

        const hash1 = computeCommitHash(commitData);
        const hash2 = computeCommitHash(commitData);
        expect(hash1).toBe(hash2);
      });

      it('produces different hash for different branch', () => {
        const base = {
          project_id: 'proj_12345678',
          parents_json: '[]',
          turn_window_json: '{}',
          facet_snapshot_json: '[]',
          pipeline_config_json: null,
          draft_id: null,
          draft_text_hash: null,
          signature_json: null,
          created_at: '2024-01-01T00:00:00.000Z',
        };

        const hash1 = computeCommitHash({ ...base, branch: 'main' });
        const hash2 = computeCommitHash({ ...base, branch: 'feature' });
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('computeTextHash', () => {
      it('returns sha256: prefixed hash', () => {
        const hash = computeTextHash('Hello world');
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('produces same hash for identical text', () => {
        const hash1 = computeTextHash('Test text');
        const hash2 = computeTextHash('Test text');
        expect(hash1).toBe(hash2);
      });

      it('produces different hash for different text', () => {
        const hash1 = computeTextHash('Text A');
        const hash2 = computeTextHash('Text B');
        expect(hash1).not.toBe(hash2);
      });

      it('handles empty string', () => {
        const hash = computeTextHash('');
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('handles unicode text', () => {
        const hash = computeTextHash('Hello 世界 🌍');
        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
      });

      it('is case sensitive', () => {
        const hash1 = computeTextHash('Hello');
        const hash2 = computeTextHash('hello');
        expect(hash1).not.toBe(hash2);
      });
    });
  });
});
