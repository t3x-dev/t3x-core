import type { SemanticContent } from '@t3x-dev/core';
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalStateYaml,
  buildStatePointRows,
  selectPrdRenderModel,
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
            outcome: '办公室上班族',
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
                title: '找到食物和饮品',
                acceptance: '用户能快速找到并满意',
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
            { set: { path: 'prd.summary.outcome', value: '办公室上班族' } },
            {
              populate: {
                path: 'prd.requirements.0',
                values: {
                  acceptance: '用户能快速找到并满意',
                  priority: 'P1',
                  title: '找到食物和饮品',
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
      },
      {
        id: 'draft_op_2',
        op: 'set',
        path: 'prd/summary/outcome',
        summary: 'Set outcome',
        afterValue: '办公室上班族',
      },
      {
        id: 'draft_op_3',
        op: 'set',
        path: 'prd/requirements/0/title',
        summary: 'Set title',
        afterValue: '找到食物和饮品',
      },
    ]);

    const rows = buildStatePointRows(PRD_CONTENT, { operations });

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
      {
        acceptance: '用户能快速找到并满意',
        priority: 'P1',
        title: '找到食物和饮品',
      },
    ]);
  });
});
