import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceRenderDocument,
  type WorkspaceRenderTreeRow,
} from '@/domain/workspaces/workspaceRenderDocument';

function row(
  partial: Omit<WorkspaceRenderTreeRow, 'expandable' | 'id' | 'parentPath' | 'type'> &
    Partial<Pick<WorkspaceRenderTreeRow, 'expandable' | 'id' | 'parentPath' | 'type'>>
): WorkspaceRenderTreeRow {
  return {
    expandable: false,
    id: partial.path,
    parentPath: partial.depth === 0 ? null : partial.path.replace(/\/[^/]+$/, '') || null,
    type: 'string',
    ...partial,
  };
}

describe('workspaceRenderDocument', () => {
  it('does not use workspace boilerplate as the document lede', () => {
    const document = buildWorkspaceRenderDocument(
      [
        row({ depth: 0, expandable: true, key: 'workspace', path: 'workspace', value: '-' }),
        row({
          changed: true,
          depth: 1,
          key: 'summary',
          path: 'workspace/summary',
          value: 'Service checkout-api currently has replicas 4',
        }),
      ],
      {
        fallbackLede: 'Collect source evidence and build the next structured state commit.',
        fallbackTitle: 'Main workspace',
      }
    );

    expect(document.title).toBe('Main workspace');
    expect(document.lede).toBe('');
    expect(document.sections.map((section) => section.title)).toEqual(['Summary']);
    expect(document.sections[0]?.highlight).toBe('Service checkout-api currently has replicas 4');
  });

  it('prefers a bound schema name and a short tagline', () => {
    const document = buildWorkspaceRenderDocument(
      [
        row({ depth: 0, expandable: true, key: 'workspace', path: 'workspace', value: '-' }),
        row({
          depth: 1,
          key: 'title',
          path: 'workspace/title',
          value: 'Main workspace',
        }),
        row({
          depth: 1,
          key: 'tagline',
          path: 'workspace/tagline',
          value: 'Internal canary rollout',
        }),
      ],
      {
        fallbackLede: 'Collect source evidence and build the next structured state commit.',
        fallbackTitle: 'Main workspace',
        schemaLabel: 'Release plan Schema',
      }
    );

    expect(document.title).toBe('Release plan');
    expect(document.lede).toBe('Internal canary rollout');
    expect(document.sections).toEqual([]);
  });

  it('renders TARGET-like section kinds from ordinary tree data', () => {
    const document = buildWorkspaceRenderDocument(
      [
        row({ depth: 0, expandable: true, key: 'release_plan', path: 'release_plan', value: '-' }),
        row({
          changed: true,
          depth: 1,
          key: 'summary',
          path: 'release_plan/summary',
          value: 'Canary to internal team at 10% with rollback readiness.',
        }),
        row({
          depth: 1,
          key: 'purpose',
          path: 'release_plan/purpose',
          value: 'Review every rollout decision.',
        }),
        row({
          depth: 1,
          expandable: true,
          key: 'rollout',
          path: 'release_plan/rollout',
          type: 'object',
          value: '-',
        }),
        row({
          depth: 2,
          key: 'stage',
          path: 'release_plan/rollout/stage',
          value: 'internal-preview',
        }),
        row({
          depth: 2,
          key: 'audience',
          path: 'release_plan/rollout/audience',
          value: 'internal-team',
        }),
        row({
          afterValue: 'true',
          changed: true,
          depth: 1,
          key: 'rollback_readiness',
          path: 'release_plan/rollback_readiness',
          type: 'boolean',
          value: 'true',
        }),
        row({
          depth: 1,
          expandable: true,
          key: 'requirements',
          path: 'release_plan/requirements',
          type: 'object',
          value: '-',
        }),
        row({
          depth: 2,
          key: 'monitoring_enabled',
          path: 'release_plan/requirements/monitoring_enabled',
          type: 'boolean',
          value: 'true',
        }),
        row({
          depth: 2,
          key: 'oncall_coverage',
          path: 'release_plan/requirements/oncall_coverage',
          type: 'boolean',
          value: 'true',
        }),
      ],
      { fallbackTitle: 'Main workspace' }
    );

    expect(document.title).toBe('Release plan');
    expect(
      document.sections.map((section) => [section.title, section.ready, section.highlight])
    ).toEqual([
      ['Summary', false, 'Canary to internal team at 10% with rollback readiness.'],
      ['Purpose', false, undefined],
      ['Rollout plan', false, undefined],
      ['Rollback readiness', true, undefined],
      ['Requirements', false, undefined],
    ]);
    expect(document.sections[2]?.tableRows.map((item) => item.value)).toEqual([
      'internal-preview',
      'internal-team',
    ]);
    expect(document.sections[4]?.checkRows.map((item) => item.label)).toEqual([
      'Monitoring enabled',
      'Oncall coverage',
    ]);
  });

  it('drops a requirements row that only repeats the summary highlight', () => {
    const document = buildWorkspaceRenderDocument([
      row({ depth: 0, expandable: true, key: 'workspace', path: 'workspace', value: '-' }),
      row({
        changed: true,
        depth: 1,
        key: 'summary',
        path: 'workspace/summary',
        value: 'Service checkout-api currently has replicas 4',
      }),
      row({
        changed: true,
        depth: 1,
        expandable: true,
        key: 'requirements',
        path: 'workspace/requirements',
        type: 'object',
        value: '1 item',
      }),
      row({
        changed: true,
        depth: 2,
        key: '0',
        path: 'workspace/requirements/0',
        value: 'Service checkout-api currently has replicas 4',
      }),
    ]);

    expect(document.sections.map((section) => section.title)).toEqual(['Summary']);
  });
});
