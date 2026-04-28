/** biome-ignore-all lint/suspicious/noExplicitAny: op tests use broad casts for concise event fixture assertions */

import type { PipelineEvent } from '@t3x-dev/core';
import { collectResult, runOperation } from '@t3x-dev/core';
import { describe, expect, it, vi } from 'vitest';
import type { ApiPipelineContext } from '../../ops/context';
import { yopsApplyOp } from '../../ops/yops-apply';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRecord = {
  id: 'yops_001',
  conversationId: 'conv_abc',
  projectId: 'proj_123',
  source: 'pipeline',
  turnHash: 'sha256:turn1',
  yops: [{ define: { path: 'test' } }],
  createdAt: new Date('2026-04-03T00:00:00Z'),
};

vi.mock('@t3x-dev/storage', () => ({
  findConversationById: vi.fn(() =>
    Promise.resolve({
      conversationId: 'conv_abc',
      projectId: 'proj_123',
      parentCommitHash: null,
    })
  ),
  getCommit: vi.fn(() => Promise.resolve(null)),
  insertYOpsLogEntry: vi.fn(() => Promise.resolve(mockRecord)),
  listActiveYOpsLogByConversation: vi.fn(() => Promise.resolve([])),
  // RFC 2026-04-26: yopsApplyOp now also imports the supersede query so
  // it can flip prior LLM suggestions to superseded inside the same
  // transaction when `replaceActiveLLMDraft` is set. Default mock is a
  // no-op returning [] so existing test cases stay unaffected. The
  // committed-id exclusion now lives inside the SQL UPDATE itself
  // (single atomic statement), so the op no longer pre-fetches anything.
  supersedeActiveLLMSuggestions: vi.fn(() => Promise.resolve([])),
  supersedeActiveUncommittedYOpsLogEntries: vi.fn(() => Promise.resolve([])),
  supersedeYOpsLogEntryForRepair: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../lib/tree-state-sync', () => ({
  syncYOpsToTrees: vi.fn(() => Promise.resolve()),
}));

function buildMockContext(overrides: Partial<ApiPipelineContext> = {}): ApiPipelineContext {
  const txProxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'transaction') {
          return async (fn: (tx: any) => Promise<any>) => fn(txProxy);
        }
        return vi.fn();
      },
    }
  );

  return {
    db: txProxy,
    projectId: 'proj_123',
    userId: 'user_1',
    providerRegistry: {},
    abortSignal: new AbortController().signal,
    ...overrides,
  } as ApiPipelineContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('yopsApplyOp', () => {
  const humanSource = {
    source: { type: 'human' as const, author: 'script-editor', at: '2026-04-28T00:00:00Z' },
  };
  const inheritedTripCommit = {
    hash: 'sha256:parent',
    project_id: 'proj_123',
    content: {
      trees: [
        {
          key: 'trip',
          slots: { destination: 'Beijing' },
          children: [
            {
              key: 'sightseeing',
              slots: { places: ['Forbidden City'] },
              children: [],
            },
          ],
        },
      ],
      relations: [],
    },
  };

  it('has the correct name', () => {
    expect(yopsApplyOp.name).toBe('yops-apply');
  });

  it('yields step_start/step_done for persist and returns formatted output', async () => {
    const ctx = buildMockContext();
    const events: PipelineEvent[] = [];

    const gen = runOperation(
      yopsApplyOp,
      {
        conversationId: 'conv_abc',
        source: 'pipeline',
        turnHash: 'sha256:turn1',
        yops: mockRecord.yops,
      },
      ctx
    );

    let result: IteratorResult<PipelineEvent, any>;
    do {
      result = await gen.next();
      if (!result.done) {
        events.push(result.value);
      }
    } while (!result.done);

    const output = result.value;

    // Verify pipeline events (op_start, step_start persist, step_done persist, op_done)
    const eventTypes = events.map((e) => `${e.type}${e.step ? `:${e.step}` : ''}`);
    expect(eventTypes).toContain('op_start');
    expect(eventTypes).toContain('step_start:persist');
    expect(eventTypes).toContain('step_done:persist');
    expect(eventTypes).toContain('op_done');

    // Verify output shape (snake_case API format)
    expect(output).toEqual({
      id: 'yops_001',
      conversation_id: 'conv_abc',
      project_id: 'proj_123',
      source: 'pipeline',
      turn_hash: 'sha256:turn1',
      yops: mockRecord.yops,
      created_at: '2026-04-03T00:00:00.000Z',
      metadata: null,
      superseded_at: null,
      is_committed: false,
      committed_by: [],
      // Default flag is off — no entries marked superseded, no flag in
      // input. Caller still sees the field (always present) for
      // observability; empty array means "no-op".
      superseded_ids: [],
    });
  });

  it('returns null for turn_hash when turnHash is undefined', async () => {
    const ctx = buildMockContext();

    // Override mock to return record with null turnHash
    const { insertYOpsLogEntry } = await import('@t3x-dev/storage');
    (insertYOpsLogEntry as any).mockResolvedValueOnce({
      ...mockRecord,
      turnHash: null,
    });

    const output = await collectResult(
      runOperation(
        yopsApplyOp,
        {
          conversationId: 'conv_abc',
          source: 'manual',
          yops: [],
        },
        ctx
      )
    );

    expect(output.turn_hash).toBeNull();
  });

  it('calls insertYOpsLogEntry and syncYOpsToTrees with correct args', async () => {
    const ctx = buildMockContext();
    const { insertYOpsLogEntry } = await import('@t3x-dev/storage');
    const { syncYOpsToTrees } = await import('../../lib/tree-state-sync');

    (insertYOpsLogEntry as any).mockClear();
    (syncYOpsToTrees as any).mockClear();

    await collectResult(
      runOperation(
        yopsApplyOp,
        {
          conversationId: 'conv_abc',
          source: 'pipeline',
          turnHash: 'sha256:turn1',
          yops: [{ define: { path: 'test' } }],
        },
        ctx
      )
    );

    expect(insertYOpsLogEntry).toHaveBeenCalledWith(
      expect.anything(), // tx
      {
        conversationId: 'conv_abc',
        projectId: 'proj_123',
        source: 'pipeline',
        turnHash: 'sha256:turn1',
        yops: [{ define: { path: 'test' } }],
      }
    );

    expect(syncYOpsToTrees).toHaveBeenCalledWith(
      expect.anything(), // tx
      'conv_abc',
      'proj_123'
    );
  });

  describe('replaceActiveLLMDraft flag', () => {
    it('does not call supersede when flag is off (or absent)', async () => {
      const ctx = buildMockContext();
      const { supersedeActiveLLMSuggestions } = await import('@t3x-dev/storage');
      (supersedeActiveLLMSuggestions as any).mockClear();

      await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'manual',
            yops: [{ define: { path: 'test' } }],
            // flag intentionally absent
          },
          ctx
        )
      );

      expect(supersedeActiveLLMSuggestions).not.toHaveBeenCalled();
    });

    it('calls supersede inside the same transaction when flag is on, surfacing the marked ids', async () => {
      const ctx = buildMockContext();
      const { supersedeActiveLLMSuggestions } = await import('@t3x-dev/storage');
      (supersedeActiveLLMSuggestions as any).mockClear();
      (supersedeActiveLLMSuggestions as any).mockResolvedValueOnce(['yl_old_suggestion']);

      const output = await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'pipeline',
            turnHash: 'sha256:turn1',
            yops: [{ define: { path: 'test' } }],
            replaceActiveLLMDraft: true,
          },
          ctx
        )
      );

      // Note: the new signature drops the excludeIds parameter — committed
      // entries are excluded by the supersede query's own WHERE clause
      // (NOT EXISTS subquery against commits.yops_log_ids), so a commit
      // landing concurrently can't slip past the safety belt.
      expect(supersedeActiveLLMSuggestions).toHaveBeenCalledWith(
        expect.anything(), // tx
        'conv_abc'
      );
      // Output surfaces the IDs that were actually marked superseded so
      // observers (logs / tests / future UI affordance) can audit the
      // replacement.
      expect(output.superseded_ids).toEqual(['yl_old_suggestion']);
    });

    it('rejects replacement draft ops that fail against the inherited parent commit baseline', async () => {
      const ctx = buildMockContext();
      const {
        findConversationById,
        getCommit,
        insertYOpsLogEntry,
        listActiveYOpsLogByConversation,
        supersedeActiveLLMSuggestions,
      } = await import('@t3x-dev/storage');
      (findConversationById as any).mockResolvedValueOnce({
        conversationId: 'conv_abc',
        projectId: 'proj_123',
        parentCommitHash: 'sha256:parent',
      });
      (getCommit as any).mockResolvedValueOnce(inheritedTripCommit);
      (insertYOpsLogEntry as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([]);
      (supersedeActiveLLMSuggestions as any).mockResolvedValueOnce(['yl_old_suggestion']);

      await expect(
        collectResult(
          runOperation(
            yopsApplyOp,
            {
              conversationId: 'conv_abc',
              source: 'pipeline',
              yops: [
                { ...humanSource, define: { path: 'trip/sightseeing/great_wall' } },
                {
                  ...humanSource,
                  populate: {
                    path: 'trip/sightseeing/great_wall',
                    values: { activity: 'visit the Great Wall' },
                  },
                },
                { ...humanSource, define: { path: 'trip/cultural_interest/mao_poetry' } },
              ],
              replaceActiveLLMDraft: true,
            },
            ctx
          )
        )
      ).rejects.toThrow(/trip\/cultural_interest/);

      expect(insertYOpsLogEntry).not.toHaveBeenCalled();
    });

    it('accepts replacement draft ops that extend an inherited parent commit path', async () => {
      const ctx = buildMockContext();
      const {
        findConversationById,
        getCommit,
        insertYOpsLogEntry,
        listActiveYOpsLogByConversation,
        supersedeActiveLLMSuggestions,
      } = await import('@t3x-dev/storage');
      (findConversationById as any).mockResolvedValueOnce({
        conversationId: 'conv_abc',
        projectId: 'proj_123',
        parentCommitHash: 'sha256:parent',
      });
      (getCommit as any).mockResolvedValueOnce(inheritedTripCommit);
      (insertYOpsLogEntry as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([]);
      (supersedeActiveLLMSuggestions as any).mockResolvedValueOnce(['yl_old_suggestion']);

      await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'pipeline',
            yops: [
              { ...humanSource, define: { path: 'trip/sightseeing/great_wall' } },
              {
                ...humanSource,
                populate: {
                  path: 'trip/sightseeing/great_wall',
                  values: { activity: 'visit the Great Wall' },
                },
              },
            ],
            replaceActiveLLMDraft: true,
          },
          ctx
        )
      );

      expect(insertYOpsLogEntry).toHaveBeenCalled();
    });
  });

  describe('repairYopsLogId', () => {
    it('supersedes active repair rows inside the same transaction before inserting repaired ops', async () => {
      const ctx = buildMockContext();
      const { insertYOpsLogEntry, supersedeYOpsLogEntryForRepair } = await import(
        '@t3x-dev/storage'
      );
      (insertYOpsLogEntry as any).mockClear();
      (supersedeYOpsLogEntryForRepair as any).mockClear();
      (supersedeYOpsLogEntryForRepair as any).mockResolvedValueOnce(['yl_before', 'yl_failing']);

      const output = await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'manual',
            yops: [{ define: { path: 'repaired' } }],
            repairYopsLogId: 'yl_failing',
          },
          ctx
        )
      );

      expect(supersedeYOpsLogEntryForRepair).toHaveBeenCalledWith(
        expect.anything(),
        'conv_abc',
        'yl_failing'
      );
      expect(insertYOpsLogEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            repair_of: 'yl_failing',
            supersedes: ['yl_before', 'yl_failing'],
            repair_reason: 'user_edited_replay_failure',
          },
        })
      );
      expect(output.superseded_ids).toEqual(['yl_before', 'yl_failing']);
    });

    it('fails without inserting when the repair target cannot be superseded', async () => {
      const ctx = buildMockContext();
      const { insertYOpsLogEntry, supersedeYOpsLogEntryForRepair } = await import(
        '@t3x-dev/storage'
      );
      (insertYOpsLogEntry as any).mockClear();
      (supersedeYOpsLogEntryForRepair as any).mockClear();
      (supersedeYOpsLogEntryForRepair as any).mockResolvedValueOnce([]);

      await expect(
        collectResult(
          runOperation(
            yopsApplyOp,
            {
              conversationId: 'conv_abc',
              source: 'manual',
              yops: [{ define: { path: 'repaired' } }],
              repairYopsLogId: 'yl_failing',
            },
            ctx
          )
        )
      ).rejects.toThrow(/Cannot repair yops_log entry/);

      expect(insertYOpsLogEntry).not.toHaveBeenCalled();
    });

    it('dry-runs the edited repair script before inserting', async () => {
      const ctx = buildMockContext();
      const {
        insertYOpsLogEntry,
        listActiveYOpsLogByConversation,
        supersedeYOpsLogEntryForRepair,
      } = await import('@t3x-dev/storage');
      (insertYOpsLogEntry as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockClear();
      (supersedeYOpsLogEntryForRepair as any).mockClear();
      (supersedeYOpsLogEntryForRepair as any).mockResolvedValueOnce(['yl_failing']);
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([]);

      await expect(
        collectResult(
          runOperation(
            yopsApplyOp,
            {
              conversationId: 'conv_abc',
              source: 'manual',
              yops: [{ define: { path: 'duplicate' } }, { define: { path: 'duplicate' } }],
              repairYopsLogId: 'yl_failing',
            },
            ctx
          )
        )
      ).rejects.toThrow(/failed dry-run/);

      expect(insertYOpsLogEntry).not.toHaveBeenCalled();
    });
  });

  describe('replaceActiveScript', () => {
    it('supersedes active uncommitted rows and dry-runs the edited full script before inserting', async () => {
      const ctx = buildMockContext();
      const { listActiveYOpsLogByConversation, supersedeActiveUncommittedYOpsLogEntries } =
        await import('@t3x-dev/storage');
      (listActiveYOpsLogByConversation as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockResolvedValueOnce(['yl_active']);
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([]);

      const output = await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'manual',
            yops: [
              { define: { path: 'trip' } },
              { populate: { path: 'trip', values: { destination: 'Beijing' } } },
            ],
            replaceActiveScript: true,
          },
          ctx
        )
      );

      expect(supersedeActiveUncommittedYOpsLogEntries).toHaveBeenCalledWith(
        expect.anything(),
        'conv_abc'
      );
      expect(output.superseded_ids).toEqual(['yl_active']);
    });

    it('records replacement lineage metadata on inserted active-script replacements', async () => {
      const ctx = buildMockContext();
      const { insertYOpsLogEntry, listActiveYOpsLogByConversation } = await import(
        '@t3x-dev/storage'
      );
      const { supersedeActiveUncommittedYOpsLogEntries } = await import('@t3x-dev/storage');
      (insertYOpsLogEntry as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockResolvedValueOnce(['yl_active']);
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([]);

      await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'manual',
            yops: [{ define: { path: 'trip' } }],
            replaceActiveScript: true,
          },
          ctx
        )
      );

      expect(insertYOpsLogEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            supersedes: ['yl_active'],
            replacement_reason: 'user_replaced_active_script',
          },
        })
      );
    });

    it('dry-runs sourced replacement ops without treating source as an operation', async () => {
      const ctx = buildMockContext();
      const { listActiveYOpsLogByConversation, supersedeActiveUncommittedYOpsLogEntries } =
        await import('@t3x-dev/storage');
      (listActiveYOpsLogByConversation as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockResolvedValueOnce(['yl_active']);
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([]);

      const output = await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'manual',
            yops: [
              {
                source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
                define: { path: 'trip' },
              },
              {
                source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
                populate: { path: 'trip', values: { destination: 'Beijing' } },
              },
            ],
            replaceActiveScript: true,
          },
          ctx
        )
      );

      expect(output.superseded_ids).toEqual(['yl_active']);
    });

    it('treats committed active rows as baseline when replacing an edited full script', async () => {
      const ctx = buildMockContext();
      const {
        insertYOpsLogEntry,
        listActiveYOpsLogByConversation,
        supersedeActiveUncommittedYOpsLogEntries,
      } = await import('@t3x-dev/storage');
      (insertYOpsLogEntry as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockResolvedValueOnce(['yl_active']);
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([
        {
          id: 'yl_committed',
          yops: [
            {
              source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
              define: { path: 'trip' },
            },
          ],
        },
      ]);

      await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'manual',
            yops: [
              {
                source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
                define: { path: 'trip' },
              },
              {
                source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
                populate: { path: 'trip', values: { destination: 'Beijing revised' } },
              },
            ],
            replaceActiveScript: true,
          },
          ctx
        )
      );

      expect(insertYOpsLogEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            dropped_baseline_define_paths: ['trip'],
            supersedes: ['yl_active'],
            replacement_reason: 'user_replaced_active_script',
          },
          yops: [
            {
              source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
              populate: { path: 'trip', values: { destination: 'Beijing revised' } },
            },
          ],
        })
      );
    });

    it('normalizes edited scripts against committed-only baseline rows without superseding them', async () => {
      const ctx = buildMockContext();
      const {
        insertYOpsLogEntry,
        listActiveYOpsLogByConversation,
        supersedeActiveUncommittedYOpsLogEntries,
      } = await import('@t3x-dev/storage');
      (insertYOpsLogEntry as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockResolvedValueOnce([]);
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([
        {
          id: 'yl_committed',
          yops: [
            {
              source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
              define: { path: 'trip' },
            },
          ],
        },
      ]);

      const output = await collectResult(
        runOperation(
          yopsApplyOp,
          {
            conversationId: 'conv_abc',
            source: 'manual',
            yops: [
              {
                source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
                define: { path: 'trip' },
              },
              {
                source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
                populate: { path: 'trip', values: { destination: 'Beijing revised' } },
              },
            ],
            replaceActiveScript: true,
          },
          ctx
        )
      );

      expect(output.superseded_ids).toEqual([]);
      expect(insertYOpsLogEntry).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          metadata: {
            dropped_baseline_define_paths: ['trip'],
            supersedes: [],
            replacement_reason: 'user_replaced_active_script',
          },
          yops: [
            {
              source: { type: 'human', author: 'script-editor', at: '2026-04-28T00:00:00Z' },
              populate: { path: 'trip', values: { destination: 'Beijing revised' } },
            },
          ],
        })
      );
    });

    it('does not insert when the replacement script fails dry-run', async () => {
      const ctx = buildMockContext();
      const {
        insertYOpsLogEntry,
        listActiveYOpsLogByConversation,
        supersedeActiveUncommittedYOpsLogEntries,
      } = await import('@t3x-dev/storage');
      (insertYOpsLogEntry as any).mockClear();
      (listActiveYOpsLogByConversation as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockClear();
      (supersedeActiveUncommittedYOpsLogEntries as any).mockResolvedValueOnce(['yl_active']);
      (listActiveYOpsLogByConversation as any).mockResolvedValueOnce([]);

      await expect(
        collectResult(
          runOperation(
            yopsApplyOp,
            {
              conversationId: 'conv_abc',
              source: 'manual',
              yops: [{ define: { path: 'trip' } }, { define: { path: 'trip' } }],
              replaceActiveScript: true,
            },
            ctx
          )
        )
      ).rejects.toThrow(/failed dry-run/);

      expect(insertYOpsLogEntry).not.toHaveBeenCalled();
    });
  });
});
