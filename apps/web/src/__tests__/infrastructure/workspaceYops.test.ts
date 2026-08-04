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

  it('applies a later iteration on top of the inherited commit state and relations', async () => {
    const candidate: WorkspaceCandidate = {
      id: 'workspace_prd',
      projectId: 'proj_1',
      title: 'PRD audience handoff',
      summary: 'Continue the PRD from its committed baseline.',
      status: 'schema_review',
      updatedAt: '2026-07-23T00:00:00.000Z',
      baseCommitHash: `sha256:${'a'.repeat(64)}`,
      targetBranch: 'main',
      sourceBundle: [{ id: 'source_chat:conv_2', type: 'chat', title: 'Second source chat' }],
      schemaBindings: [{ schemaName: 'PRD Schema', version: 'v2', mode: 'pinned' }],
      schemaCandidate: {
        summary: 'Second iteration candidate.',
        fields: [
          {
            id: 'field_summary',
            path: 'summary',
            label: 'Summary',
            type: 'object',
            required: true,
            status: 'needs_confirmation',
            sourceRefs: 1,
            children: [
              {
                id: 'field_summary_outcome',
                path: 'summary.outcome',
                label: 'Outcome',
                type: 'string',
                required: true,
                status: 'covered',
                value: 'Plan a week in Chengdu',
                sourceRefs: 1,
              },
            ],
          },
        ],
      },
      schemaReview: { verdict: 'needs_review', summary: 'Audience is inherited.', gaps: [] },
      yopsDraft: {
        id: 'draft_second_iteration',
        operations: [
          {
            id: 'op_outcome',
            op: 'set',
            path: 'prd/summary/outcome',
            summary: 'Set the new outcome.',
            beforeValue: '',
            afterValue: 'Plan a week in Chengdu',
          },
        ],
      },
      outputTargets: [],
    };
    const inheritedRelations = [
      { from: 'prd/summary', to: 'prd/requirements/legal_trip', type: 'depends_on' },
    ];
    let requestBody: {
      trees: Array<{
        key: string;
        slots: Record<string, unknown>;
        children: Array<{
          key: string;
          slots: Record<string, unknown>;
          children: unknown[];
        }>;
      }>;
      relations: unknown[];
    } | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        success: true,
        data: {
          ok: true,
          applied: 1,
          preview: {
            trees: requestBody?.trees ?? [],
            relations: requestBody?.relations ?? [],
          },
        },
      });
    });

    const result = await validateWorkspaceYOps(candidate, {
      trees: [
        {
          key: 'prd',
          slots: { title: 'PRD audience handoff' },
          children: [
            {
              key: 'summary',
              slots: { audience: 'Product reviewers', outcome: 'Previous outcome' },
              children: [],
            },
            {
              key: 'requirements',
              slots: {},
              children: [
                {
                  key: 'legal_trip',
                  slots: { acceptance: ['Keep the existing acceptance criteria.'] },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
      relations: inheritedRelations,
    });

    const prd = requestBody?.trees.find((tree) => tree.key === 'prd');
    const summary = prd?.children.find((node) => node.key === 'summary');
    const requirements = prd?.children.find((node) => node.key === 'requirements');

    expect(summary?.slots).toEqual({ audience: 'Product reviewers', outcome: 'Previous outcome' });
    expect(requirements?.children).toEqual([
      expect.objectContaining({
        key: 'legal_trip',
        slots: { acceptance: ['Keep the existing acceptance criteria.'] },
      }),
    ]);
    expect(requestBody?.relations).toEqual(inheritedRelations);
    expect(result.previewRelations).toEqual(inheritedRelations);
  });

  it('validates ESPHome Device operations under device root with object values', async () => {
    const device = {
      esphome: { name: 'office-lunch-demo' },
      esp32: { board: 'esp32dev' },
      logger: {},
      api: {},
    };
    const candidate: WorkspaceCandidate = {
      id: 'workspace_esphome_device',
      projectId: 'proj_1',
      title: 'ESPHome workspace',
      summary: 'Validate an ESPHome device.',
      status: 'schema_review',
      updatedAt: '2026-07-30T00:00:00.000Z',
      baseCommitHash: null,
      targetBranch: 'main',
      sourceBundle: [{ id: 'src_yaml', type: 'document', title: 'Device YAML' }],
      schemaBindings: [
        {
          canonicalName: 't3x/esphome-device',
          schemaName: 'ESPHome Device',
          version: 'v1',
          mode: 'pinned',
        },
      ],
      schemaCandidate: { summary: 'ESPHome Device mapped from source.', fields: [] },
      schemaReview: { verdict: 'ready', summary: 'Ready.', gaps: [] },
      yopsDraft: {
        id: 'draft_esphome_device',
        operations: [
          {
            id: 'op_esphome_device',
            op: 'set',
            path: 'device',
            summary: 'Set ESPHome device config.',
            beforeValue: '',
            afterValue: device,
            sourceRefs: ['src_yaml'],
          },
        ],
      },
      outputTargets: [],
    };
    let requestBody: { trees: Array<{ key: string }>; yops: unknown[] } | null = null;
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

    expect(requestBody?.trees[0]?.key).toBe('device');
    expect(requestBody?.yops).toEqual([{ set: { path: 'device', value: device } }]);
  });
});
