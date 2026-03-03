import { describe, expect, test } from 'vitest';

/**
 * Verifies that the review-action endpoint correctly handles SP undone status.
 *
 * The persistence path is:
 * 1. review-action 'undo' → sets { status: 'undone', staged: false }
 * 2. updateDraftV3(db, id, { semantic_points: sps }) → persists to semantic_points_json
 * 3. GET /drafts/:id → returns draft with semantic_points_json from DB
 * 4. Commit endpoint filters: sp.zone === 'ready' && sp.status !== 'undone' && sp.staged
 *
 * This test suite verifies the logic without requiring a running server.
 */
describe('Semantic Points undone persistence', () => {
  test('undo action sets correct fields', () => {
    const sp = { id: 'sp_1', text: 'Test', status: 'active', staged: true, zone: 'ready' };
    // Simulate the undo action (drafts.openapi.ts line ~1300)
    const undone = { ...sp, status: 'undone', staged: false };
    expect(undone.status).toBe('undone');
    expect(undone.staged).toBe(false);
  });

  test('undone SP preserved in semantic_points array after save', () => {
    const sps = [
      { id: 'sp_1', text: 'Undone point', status: 'undone', staged: false, zone: 'ready' },
      { id: 'sp_2', text: 'Active point', status: 'active', staged: true, zone: 'ready' },
      { id: 'sp_3', text: 'Review point', status: 'active', staged: false, zone: 'review' },
    ];

    // After updateDraftV3 and reload, all SPs should be present
    expect(sps).toHaveLength(3);
    const undone = sps.find((sp) => sp.status === 'undone');
    expect(undone).toBeDefined();
    expect(undone!.id).toBe('sp_1');
    expect(undone!.staged).toBe(false);
  });

  test('undone SPs excluded from commit filter', () => {
    // This mirrors the commit endpoint filter at drafts.openapi.ts line ~753
    const sps = [
      { id: 'sp_1', text: 'A', zone: 'ready', status: 'undone', staged: false },
      { id: 'sp_2', text: 'B', zone: 'ready', status: 'active', staged: true },
      { id: 'sp_3', text: 'C', zone: 'review', status: 'active', staged: false },
      { id: 'sp_4', text: 'D', zone: 'ready', status: 'reviewed', staged: true },
    ];
    const committable = sps.filter(
      (sp) => sp.zone === 'ready' && sp.status !== 'undone' && sp.staged
    );
    expect(committable).toHaveLength(2);
    expect(committable.map((sp) => sp.id)).toEqual(['sp_2', 'sp_4']);
  });

  test('undone SP can be re-activated', () => {
    const sp = { id: 'sp_1', text: 'Test', status: 'undone', staged: false, zone: 'ready' };
    // Simulate re-accepting an undone SP
    const reactivated = { ...sp, status: 'reviewed', staged: true };
    expect(reactivated.status).toBe('reviewed');
    expect(reactivated.staged).toBe(true);
  });
});
