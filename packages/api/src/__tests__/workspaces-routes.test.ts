import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  closeDB: vi.fn(() => Promise.resolve()),
  getDB: vi.fn(() => Promise.resolve({})),
}));

import { workspaceRoutes } from '../routes/workspaces.openapi';

// biome-ignore lint/suspicious/noExplicitAny: route responses are intentionally schema-flexible here.
type ApiResponse = any;

describe('Workspace routes', () => {
  const app = new Hono();
  app.route('/', workspaceRoutes);

  it('extracts schema candidates from each source instead of a single merged text blob', async () => {
    const res = await app.request(
      '/v1/projects/proj_sources/workspaces/workspace_prd_handoff/extract-candidate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            id: 'workspace_prd_handoff',
            projectId: 'proj_sources',
            schemaBindings: [{ schemaName: 'PRD Schema v2' }],
            sourceBundle: [],
          },
          sources: [
            {
              id: 'src_old',
              type: 'document',
              title: 'Old PRD',
              previewText: [
                'Problem: Old problem',
                'Audience: Old reviewers',
                'Outcome: Old outcome',
                'Requirement: Old requirement',
                'Priority: should',
                'Acceptance: Old acceptance',
              ].join('\n'),
            },
            {
              id: 'src_new',
              type: 'document',
              title: 'New PRD',
              previewText: [
                'Problem: New problem',
                'Audience: New reviewers',
                'Outcome: New outcome',
                'Requirement: New requirement',
                'Priority: must',
                'Acceptance: New acceptance',
              ].join('\n'),
            },
          ],
        }),
      }
    );

    expect(res.status).toBe(200);
    const body: ApiResponse = await res.json();
    expect(body.success).toBe(true);

    const fields = body.data.workspace.schemaCandidate.fields;
    const summary = fields.find((field: ApiResponse) => field.path === 'summary');
    const problem = summary.children.find((field: ApiResponse) => field.path === 'summary.problem');
    const audience = summary.children.find(
      (field: ApiResponse) => field.path === 'summary.audience'
    );
    expect(problem.value).toBe('New problem');
    expect(audience.evidence).toBe('New PRD: New reviewers');

    const requirements = fields.find((field: ApiResponse) => field.path === 'requirements');
    expect(requirements.children).toHaveLength(2);
    expect(requirements.children.map((field: ApiResponse) => field.path)).toEqual([
      'requirements.old_requirement',
      'requirements.new_requirement',
    ]);
    expect(requirements.children[1].children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'requirements.new_requirement.priority',
          value: 'must',
          evidence: 'New PRD: must',
        }),
      ])
    );
  });
});
