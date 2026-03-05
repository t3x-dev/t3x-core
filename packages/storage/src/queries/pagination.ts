/**
 * Cursor-based pagination helpers.
 *
 * Cursor format: base64url(JSON.stringify({ t: timestamp, k: tiebreaker }))
 * - t = ORDER BY primary column value (ISO timestamp string)
 * - k = tiebreaker column value (hash or id string)
 */

/**
 * A page of results with cursor-based pagination metadata.
 */
export interface CursorPage<T> {
  items: T[];
  /** Opaque cursor to pass as `cursor` for the next page. Null on last page. */
  next_cursor: string | null;
  /** True if more results exist beyond this page. */
  has_more: boolean;
}

/**
 * Encode a cursor from timestamp + tiebreaker values.
 * Uses base64url encoding for URL-safe opaque cursors.
 */
export function encodeCursor(t: string, k: string): string {
  return Buffer.from(JSON.stringify({ t, k })).toString('base64url');
}

/**
 * Decode a cursor string back to timestamp + tiebreaker values.
 * Throws if the cursor is malformed.
 */
export function decodeCursor(cursor: string): { t: string; k: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (typeof parsed.t !== 'string' || typeof parsed.k !== 'string') {
      throw new Error('Invalid cursor structure');
    }
    return { t: parsed.t, k: parsed.k };
  } catch {
    throw new Error(`Invalid cursor: ${cursor.slice(0, 20)}...`);
  }
}

/**
 * Build a CursorPage from a rows array fetched with limit+1 strategy.
 *
 * @param rows - Rows fetched with LIMIT = limit + 1
 * @param limit - The requested page size
 * @param extractCursor - Function to extract (t, k) from the last item for the next cursor
 * @returns CursorPage<T> with items, next_cursor, and has_more
 */
export function toCursorPage<T>(
  rows: T[],
  limit: number,
  extractCursor: (item: T) => { t: string; k: string }
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const { t, k } = extractCursor(items[items.length - 1]);
    nextCursor = encodeCursor(t, k);
  }

  return { items, next_cursor: nextCursor, has_more: hasMore };
}
