import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateWorkspaceYOps } from '@/infrastructure/workspaceYops';
import type { WorkspaceCandidate } from '@/types/workspaces';

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('validateWorkspaceYOps', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not seed append afterValue into the baseline array', async () => {
    const acceptance = 'The guidance must state that users need the right permits or licences.';
    const candidate: WorkspaceCandidate = {
      id: 'workspace_prd',
      projectId: 'proj_1',
      title: 'PRD audience handoff',
      summary: 'Review legal lobster fishing guidance.',
      status: 'schema_review',
      updatedAt: '2026-07-15T00:00:00.000Z',
      baseCommitHash: null,
      targetBranch: 'feature/prd-audience',
      sourceBundle: [
        {
          id: 'source_chat:conv_1',
          type: 'chat',
          title: 'Source chat',
        },
      ],
      schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
      schemaCandidate: {
        summary: 'Candidate mapped from source.',
        fields: [
          {
            id: 'field_requirements',
            path: 'requirements',
            label: 'Requirements',
            type: 'object',
            required: true,
            status: 'covered',
            sourceRefs: 1,
            children: [
              {
                id: 'field_requirement',
                path: 'requirements.legal_lobster_fishing_guidance',
                label: 'Legal lobster fishing guidance',
                type: 'object',
                required: true,
                status: 'covered',
                sourceRefs: 1,
                children: [
                  {
                    id: 'field_acceptance',
                    path: 'requirements.legal_lobster_fishing_guidance.acceptance',
                    label: 'Acceptance',
                    type: 'array',
                    required: true,
                    status: 'covered',
                    value: acceptance,
                    sourceRefs: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
      schemaReview: {
        verdict: 'ready',
        summary: 'Ready.',
        gaps: [],
      },
      yopsDraft: {
        id: 'draft_prd',
        operations: [
          {
            id: 'op_acceptance',
            op: 'add',
            path: 'prd/requirements/legal_lobster_fishing_guidance/acceptance/-',
            summary: 'Add acceptance criteria.',
            beforeValue: 'No value recorded',
            afterValue: acceptance,
            sourceRefs: ['source_chat:conv_1'],
          },
        ],
      },
      outputTargets: [],
    };
    let requestBody: {
      trees: Array<{
        children: Array<{
          key: string;
          children: Array<{ key: string; slots: Record<string, unknown> }>;
        }>;
      }>;
      yops: unknown[];
    } | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        success: true,
        data: {
          ok: true,
          applied: 1,
          preview: { trees: [], relations: [] },
        },
      });
    });

    await validateWorkspaceYOps(candidate);

    const requirements = requestBody?.trees[0]?.children.find(
      (node) => node.key === 'requirements'
    );
    const requirement = requirements?.children.find(
      (node) => node.key === 'legal_lobster_fishing_guidance'
    );

    expect(requirement?.slots.acceptance).toEqual([]);
    expect(requestBody?.yops).toEqual([
      {
        append: {
          path: 'prd/requirements/legal_lobster_fishing_guidance/acceptance',
          value: acceptance,
        },
      },
    ]);
  });
});
