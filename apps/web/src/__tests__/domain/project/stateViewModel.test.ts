import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  countStateYOps,
  selectPrdRenderModel,
  selectSkillRenderModel,
  workspaceDraftOperationsToStateOperations,
} from '@/domain/project/stateViewModel';

const PRD_CONTENT: SemanticContent = {
  trees: [
    {
      key: 'prd',
      slots: {
        title: 'PRD audience handoff',
      },
      children: [
        {
          key: 'summary',
          slots: {
            problem: 'You: i need food and drink',
            audience: '',
            outcome: 'Office workers',
          },
          children: [],
        },
        {
          key: 'requirements',
          slots: {},
          children: [
            {
              key: '0',
              slots: {
                title: 'Find food and drinks',
                acceptance: 'Users can quickly find satisfying options',
                priority: 'P1',
              },
              children: [],
            },
          ],
        },
        {
          key: 'metadata',
          slots: {
            version: '1.0.0',
            source: 'source_chat:conv_d4d239f3',
          },
          children: [],
        },
      ],
    },
  ],
  relations: [],
};

const SKILL_CONTENT: SemanticContent = {
  trees: [
    {
      key: 'manifest',
      slots: {
        name: 'review-code',
        summary: 'Review code changes for defects and regressions.',
      },
      children: [],
    },
    {
      key: 'activation',
      slots: {
        implicit: true,
        should_trigger: ['Review this pull request.'],
        should_not_trigger: ['Implement this feature.'],
      },
      children: [],
    },
    {
      key: 'contract',
      slots: {
        goal: 'Produce an evidence-backed review.',
        inputs: ['Repository changes'],
        outputs: ['Actionable findings'],
        non_goals: ['Implement fixes'],
        truth_policy: 'evidence_only',
        default_freedom: 'medium',
      },
      children: [],
    },
    {
      key: 'workflows',
      slots: {},
      children: [
        {
          key: 'review_changes',
          slots: {
            title: 'Review changes',
            kind: 'primary',
            when: 'Reviewing a patch or pull request.',
            output_formats: ['markdown'],
            persistence: 'none',
            on_empty: 'continue',
            on_failure: 'report_and_stop',
          },
          children: [],
        },
      ],
    },
    {
      key: 'instructions',
      slots: {},
      children: [
        {
          key: 'verify',
          slots: {
            sequence: 2,
            kind: 'verification',
            title: 'Verify findings',
            body: 'Run focused checks.',
            freedom: 'low',
            effect: 'read',
            approval: 'none',
            success_criteria: ['Every finding names a path.'],
          },
          children: [],
        },
        {
          key: 'inspect',
          slots: {
            sequence: 1,
            kind: 'procedure',
            title: 'Inspect changes',
            body: 'Read the diff and surrounding code.',
            freedom: 'medium',
            effect: 'read',
            approval: 'none',
          },
          children: [],
        },
      ],
    },
    {
      key: 'resources',
      slots: {},
      children: [
        {
          key: 'severity_rules',
          slots: {
            kind: 'data',
            path: 'data/severity.csv',
            description: 'Structured severity rules.',
            load_policy: 'on_demand',
            media_type: 'text/csv',
            use_when: 'Classifying a defect.',
          },
          children: [],
        },
      ],
    },
    {
      key: 'checks',
      slots: {},
      children: [
        {
          key: 'delivery_checklist',
          slots: {
            kind: 'checklist',
            run_when: 'before_delivery',
            blocking: true,
            assertions: ['Every finding names a path.'],
          },
          children: [],
        },
      ],
    },
  ],
  relations: [
    {
      type: 'has_step',
      from: 'workflows/review_changes',
      to: 'instructions/inspect',
    },
    {
      type: 'has_step',
      from: 'workflows/review_changes',
      to: 'instructions/verify',
    },
    {
      type: 'workflow_uses_resource',
      from: 'workflows/review_changes',
      to: 'resources/severity_rules',
    },
    {
      type: 'instruction_uses_resource',
      from: 'instructions/inspect',
      to: 'resources/severity_rules',
    },
    {
      type: 'verifies',
      from: 'checks/delivery_checklist',
      to: 'workflows/review_changes',
    },
  ],
};

describe('stateViewModel', () => {
  it('builds YAML-shaped point rows instead of detached cards or diff lines', () => {
    const rows = buildStatePointRows(PRD_CONTENT, {
      gaps: [{ path: 'prd.summary.audience' }],
    });

    expect(rows.map((row) => `${row.depth}:${row.path}:${row.key}`)).toEqual([
      '0:prd:prd',
      '1:prd/title:title',
      '1:prd/summary:summary',
      '2:prd/summary/problem:problem',
      '2:prd/summary/audience:audience',
      '2:prd/summary/outcome:outcome',
      '1:prd/requirements:requirements',
      '2:prd/requirements/0:0',
      '3:prd/requirements/0/title:title',
      '3:prd/requirements/0/acceptance:acceptance',
      '3:prd/requirements/0/priority:priority',
      '1:prd/metadata:metadata',
      '2:prd/metadata/version:version',
      '2:prd/metadata/source:source',
    ]);

    expect(rows.find((row) => row.path === 'prd/summary/audience')).toMatchObject({
      issueCount: 1,
      status: 'missing',
      statusLabel: 'missing',
      value: 'empty',
    });
    expect(rows.find((row) => row.path === 'prd/summary')).toMatchObject({
      issueCount: 1,
    });
  });

  it('maps committed YOps to source/op labels without requiring a diff endpoint', () => {
    const rows = buildStatePointRows(PRD_CONTENT, {
      operations: [
        {
          created_at: '2026-07-09T00:00:00.000Z',
          id: 'op_1',
          model: null,
          source: 'source_chat',
          turn_hash: 'turn_1',
          yops: [
            { set: { path: 'prd.summary.problem', value: 'You: i need food and drink' } },
            { set: { path: 'prd.summary.outcome', value: 'Office workers' } },
            {
              populate: {
                path: 'prd.requirements.0',
                values: {
                  acceptance: 'Users can quickly find satisfying options',
                  priority: 'P1',
                  title: 'Find food and drinks',
                },
              },
            },
          ],
        },
      ],
    });

    expect(rows.find((row) => row.path === 'prd/summary/problem')).toMatchObject({
      sourceOp: '01 SET',
      status: 'set',
    });
    expect(rows.find((row) => row.path === 'prd/summary/outcome')).toMatchObject({
      sourceOp: '02 SET',
      status: 'set',
    });
    expect(rows.find((row) => row.path === 'prd/requirements/0/title')).toMatchObject({
      sourceOp: '03 POPULATE',
      status: 'created',
    });
  });

  it('maps committed workspace draft operations into state point source ops', () => {
    const operations = workspaceDraftOperationsToStateOperations([
      {
        id: 'draft_op_1',
        op: 'set',
        path: 'prd/summary/problem',
        summary: 'Set problem',
        afterValue: 'You: i need food and drink',
        sourceRefs: ['support-session'],
      },
      {
        id: 'draft_op_2',
        op: 'set',
        path: 'prd/summary/outcome',
        summary: 'Set outcome',
        afterValue: 'Office workers',
      },
      {
        id: 'draft_op_3',
        op: 'set',
        path: 'prd/requirements/0/title',
        summary: 'Set title',
        afterValue: 'Find food and drinks',
      },
    ]);

    const rows = buildStatePointRows(PRD_CONTENT, { operations });

    expect(operations[0]?.source).toBe('support-session');
    expect(rows.find((row) => row.path === 'prd/summary')).toMatchObject({
      status: 'changed',
      statusLabel: '2 changes',
    });
    expect(rows.find((row) => row.path === 'prd/summary/problem')).toMatchObject({
      sourceOp: '01 SET',
      status: 'set',
    });
    expect(rows.find((row) => row.path === 'prd/summary/outcome')).toMatchObject({
      sourceOp: '02 SET',
      status: 'set',
    });
    expect(rows.find((row) => row.path === 'prd/requirements/0/title')).toMatchObject({
      sourceOp: '03 SET',
      status: 'set',
    });
  });

  it('keeps snapshot rows unchanged when no operation evidence is attached', () => {
    const rows = buildStatePointRows(PRD_CONTENT);

    expect(rows.find((row) => row.path === 'prd')).toMatchObject({
      sourceOp: '-',
      status: 'unchanged',
      statusLabel: 'unchanged',
    });
    expect(rows.find((row) => row.path === 'prd/summary/problem')).toMatchObject({
      sourceOp: '-',
      status: 'unchanged',
      statusLabel: 'unchanged',
    });
  });

  it('serializes committed state as canonical YAML, not internal semantic trees', () => {
    const yaml = buildCanonicalStateYaml(PRD_CONTENT);

    expect(yaml).toContain('prd:');
    expect(yaml).toContain('summary:');
    expect(yaml).toContain('problem: "You: i need food and drink"');
    expect(yaml).not.toContain('trees:');
    expect(yaml).not.toContain('slots:');
  });

  it('selects a PRD render model from the schema-shaped state', () => {
    const model = selectPrdRenderModel(PRD_CONTENT, {
      gaps: [{ path: 'prd.summary.audience' }],
    });

    expect(model.title).toBe('PRD audience handoff');
    expect(model.problem).toBe('You: i need food and drink');
    expect(model.audienceMissing).toBe(true);
    expect(model.requirements).toEqual([
      expect.objectContaining({
        acceptance: 'Users can quickly find satisfying options',
        key: '0',
        priority: 'P1',
        title: 'Find food and drinks',
      }),
    ]);
    expect(model.changes).toEqual([]);
    expect(model.evidence).toEqual([]);
  });

  it('renders a schema-backed audience list without treating it as a missing scalar', () => {
    const content: SemanticContent = {
      ...PRD_CONTENT,
      trees: [
        {
          ...PRD_CONTENT.trees[0]!,
          children: PRD_CONTENT.trees[0]!.children.map((child) =>
            child.key === 'summary'
              ? {
                  ...child,
                  slots: {
                    ...child.slots,
                    audience: ['Customers', 'support agents', 'platform engineers'],
                  },
                }
              : child
          ),
        },
      ],
    };

    const model = selectPrdRenderModel(content);

    expect(model.audience).toBe('Customers · support agents · platform engineers');
    expect(model.audienceMissing).toBe(false);
  });

  it('groups root contract flags and omits duplicate root metadata from the reader', () => {
    const content: SemanticContent = {
      ...PRD_CONTENT,
      trees: [
        {
          ...PRD_CONTENT.trees[0]!,
          slots: { ...PRD_CONTENT.trees[0]!.slots, review_required: true },
          children: [
            ...PRD_CONTENT.trees[0]!.children,
            {
              key: 'root_metadata',
              slots: { title: 'Duplicate title' },
              children: [],
            },
          ],
        },
      ],
    };

    const model = selectPrdRenderModel(content);

    expect(model.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'contract_flags', value: { review_required: true } }),
      ])
    );
    expect(model.sections.some((section) => section.key === 'root_metadata')).toBe(false);
  });

  it('counts nested YOps rather than operation-log envelopes', () => {
    expect(
      countStateYOps([
        {
          created_at: '2026-07-09T00:00:00.000Z',
          id: 'op_1',
          source: 'pipeline',
          turn_hash: 'turn_1',
          yops: [
            { populate: { path: 'prd', values: { title: 'Checkout recovery' } } },
            { populate: { path: 'prd.summary', values: { audience: ['Customers'] } } },
          ],
        },
      ])
    ).toBe(2);
  });

  it('builds PRD reader evidence and materialized change rows from committed YOps', () => {
    const model = selectPrdRenderModel(PRD_CONTENT, {
      operations: [
        {
          created_at: '2026-07-09T00:00:00.000Z',
          id: 'op_1',
          source: 'source_chat',
          turn_hash: 'turn_1',
          yops: [
            { set: { path: 'prd.summary.problem', value: 'You: i need food and drink' } },
            {
              populate: {
                path: 'prd.requirements.0',
                values: { priority: 'P1', title: 'Find food and drinks' },
              },
            },
          ],
        },
      ],
    });

    expect(model.evidence).toEqual([
      expect.objectContaining({
        fieldPaths: ['prd/summary/problem', 'prd/requirements/0'],
        label: 'S1',
        sourceId: 'turn_1',
        title: 'Source Chat',
      }),
    ]);
    expect(model.changes).toEqual([
      expect.objectContaining({ kind: 'SET', path: 'prd/summary/problem', title: 'Problem' }),
      expect.objectContaining({ kind: 'POPULATE', path: 'prd/requirements/0', title: '0' }),
    ]);
  });

  it('selects a schema-aware Skill render model with deterministic instruction order', () => {
    const model = selectSkillRenderModel(SKILL_CONTENT);

    expect(model).toMatchObject({
      defaultFreedom: 'medium',
      goal: 'Produce an evidence-backed review.',
      implicit: true,
      name: 'review-code',
      truthPolicy: 'evidence_only',
    });
    expect(model.shouldTrigger).toEqual(['Review this pull request.']);
    expect(model.workflows).toEqual([
      expect.objectContaining({
        checkKeys: ['delivery_checklist'],
        key: 'review_changes',
        resourceKeys: ['severity_rules'],
        stepKeys: ['inspect', 'verify'],
      }),
    ]);
    expect(model.checks[0]).toMatchObject({ blocking: true, runWhen: 'before_delivery' });
    expect(model.resources[0]).toMatchObject({
      kind: 'data',
      loadPolicy: 'on_demand',
      mediaType: 'text/csv',
    });
    expect(model.instructions.map((instruction) => instruction.key)).toEqual(['inspect', 'verify']);
    expect(model.instructions[0]?.resourceKeys).toEqual(['severity_rules']);
    expect(model.instructions[1]).toMatchObject({
      effect: 'read',
      freedom: 'low',
      successCriteria: ['Every finding names a path.'],
    });
  });
});
