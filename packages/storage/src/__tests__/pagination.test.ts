import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, toCursorPage } from '../queries/pagination';

describe('Cursor Pagination Helpers', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('round-trips timestamp + key', () => {
      const t = '2026-01-01T00:00:00.000Z';
      const k = 'sha256:abc123';
      const cursor = encodeCursor(t, k);
      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual({ t, k });
    });

    it('produces URL-safe base64url string', () => {
      const cursor = encodeCursor('2026-01-01T00:00:00.000Z', 'id_123');
      // base64url uses - and _ instead of + and /
      expect(cursor).not.toMatch(/[+/=]/);
    });

    it('throws on malformed cursor', () => {
      expect(() => decodeCursor('not-a-valid-cursor')).toThrow('Invalid cursor');
    });

    it('throws on cursor with wrong structure', () => {
      const bad = Buffer.from(JSON.stringify({ x: 1 })).toString('base64url');
      expect(() => decodeCursor(bad)).toThrow('Invalid cursor');
    });

    it('throws on empty string', () => {
      expect(() => decodeCursor('')).toThrow();
    });
  });

  describe('toCursorPage', () => {
    const extract = (item: { ts: string; id: string }) => ({ t: item.ts, k: item.id });

    it('returns all items and has_more=false when rows <= limit', () => {
      const rows = [
        { ts: '2026-01-03', id: 'c' },
        { ts: '2026-01-02', id: 'b' },
        { ts: '2026-01-01', id: 'a' },
      ];
      const page = toCursorPage(rows, 5, extract);
      expect(page.items).toHaveLength(3);
      expect(page.has_more).toBe(false);
      expect(page.next_cursor).toBeNull();
    });

    it('trims extra row and returns has_more=true when rows > limit', () => {
      const rows = [
        { ts: '2026-01-03', id: 'c' },
        { ts: '2026-01-02', id: 'b' },
        { ts: '2026-01-01', id: 'a' }, // extra row
      ];
      const page = toCursorPage(rows, 2, extract);
      expect(page.items).toHaveLength(2);
      expect(page.has_more).toBe(true);
      expect(page.next_cursor).toBeTruthy();

      // Cursor should encode the last returned item (not the trimmed one)
      const decoded = decodeCursor(page.next_cursor!);
      expect(decoded).toEqual({ t: '2026-01-02', k: 'b' });
    });

    it('returns empty page for empty rows', () => {
      const page = toCursorPage([], 10, extract);
      expect(page.items).toHaveLength(0);
      expect(page.has_more).toBe(false);
      expect(page.next_cursor).toBeNull();
    });

    it('handles limit=1 correctly', () => {
      const rows = [
        { ts: '2026-01-02', id: 'b' },
        { ts: '2026-01-01', id: 'a' }, // extra
      ];
      const page = toCursorPage(rows, 1, extract);
      expect(page.items).toHaveLength(1);
      expect(page.has_more).toBe(true);
      expect(page.next_cursor).toBeTruthy();
    });
  });
});
