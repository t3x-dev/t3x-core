import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProjectWorkspaceStarterCandidate } from '@/data/workspaceCandidates';
import { parseWorkspaceYOpsScript } from '@/domain/workspaces/yopsScript';
import { getWorkspaceYOpsRootKey, validateWorkspaceYOps } from '@/infrastructure/workspaceYops';
import type { WorkspaceCandidate } from '@/types/workspaces';

const candidate: WorkspaceCandidate = {
  ...getProjectWorkspaceStarterCandidate('test'),
  baseCommitHash: `sha256:${'a'.repeat(64)}`,
  schemaCandidate: {
    summary: 'Must not alter the baseline',
    fields: [
      {
        id: 'scaffold',
        path: 'invented',
        label: 'Invented',
        type: 'string',
        required: false,
        status: 'covered',
        value: 'Not committed',
      },
    ],
  },
  yopsDraft: {
    id: 'draft',
    operations: [
      {
        id: 'clear',
        op: 'set',
        path: 'Services/API-server/maxRetries',
        summary: 'Clear retry limit',
        beforeValue: 99,
        afterValue: null,
      },
      {
        id: 'disable',
        op: 'set',
        path: 'Settings/Enabled',
        summary: 'Disable setting',
        afterValue: false,
      },
      { id: 'empty', op: 'set', path: 'Settings/Tags', summary: 'Clear tags', afterValue: [] },
    ],
  },
};
const baseline = {
  trees: [
    {
      key: 'Services',
      slots: {},
      children: [{ key: 'API-server', slots: { maxRetries: 3 }, children: [] }],
    },
    { key: 'Settings', slots: { Enabled: true, Tags: ['local'] }, children: [] },
  ],
  relations: [{ from: 'Services', to: 'Settings', type: 'depends_on' }],
};

describe('Unbound workspace replay boundary', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps exact committed trees, relations and JSON values without scaffolding', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { ok: true, applied: 3, preview: baseline } }),
          { status: 200 }
        )
      );
    await validateWorkspaceYOps(candidate, baseline);
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.trees).toEqual(baseline.trees);
    expect(body.relations).toEqual(baseline.relations);
    expect(body.yops).toEqual([
      { set: { path: 'Services/API-server/maxRetries', value: null } },
      { set: { path: 'Settings/Enabled', value: false } },
      { set: { path: 'Settings/Tags', value: [] } },
    ]);
    expect(candidate.schemaBindings).toEqual([]);
    expect(getWorkspaceYOpsRootKey([])).toBe('');
  });

  it('starts an unbound empty project from an empty baseline', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { ok: true, applied: 0, preview: { trees: [], relations: [] } },
        }),
        { status: 200 }
      )
    );
    await validateWorkspaceYOps({
      ...candidate,
      baseCommitHash: null,
      yopsDraft: { id: 'empty', operations: [] },
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).trees).toEqual([]);
  });

  it('preserves exact unbound script paths and keeps relative bound paths working', () => {
    const script =
      'yops:\n  - set:\n      path: Services/API-server/maxRetries\n      value: null\n';
    expect(parseWorkspaceYOpsScript(script, { currentOperations: [], rootKey: '' })).toMatchObject({
      ok: true,
      operations: [{ path: 'Services/API-server/maxRetries', afterValue: null }],
    });
    expect(
      parseWorkspaceYOpsScript(
        'yops:\n  - set:\n      path: summary/audience\n      value: Reviewers\n',
        { currentOperations: [], rootKey: 'prd' }
      )
    ).toMatchObject({ ok: true, operations: [{ path: 'prd/summary/audience' }] });
  });
});
