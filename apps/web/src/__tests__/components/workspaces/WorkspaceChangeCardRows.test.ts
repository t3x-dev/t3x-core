// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { selectWorkspaceChangeCardRows } from '@/components/workspaces/WorkspaceComposeReviewSurface';

describe('workspace change card scope', () => {
  const group = { path: 'prd/summary', expandable: true, diff: { exact: false } };
  const changed = { path: 'prd/summary/title', expandable: false, diff: { exact: true } };
  const nested = { path: 'prd/summary/items/0', expandable: false, diff: { exact: true } };
  const unchanged = { path: 'prd/summary/audience', expandable: false };
  const sibling = { path: 'prd/summary_extra/title', expandable: false, diff: { exact: true } };
  const rows = [group, changed, unchanged, nested, sibling];

  it('returns all descendant fields in tree order, including unchanged fields', () => {
    expect(selectWorkspaceChangeCardRows(rows, group)).toEqual([changed, unchanged, nested]);
  });

  it('returns only the selected leaf', () => {
    expect(selectWorkspaceChangeCardRows(rows, changed)).toEqual([changed]);
  });

  it('does not duplicate a container above its child fields', () => {
    const exactGroup = { ...group, diff: { exact: true } };
    expect(selectWorkspaceChangeCardRows([exactGroup, changed], exactGroup)).toEqual([changed]);
  });

  it('keeps unchanged groups readable and handles empty containers and missing selection', () => {
    expect(selectWorkspaceChangeCardRows([group, unchanged], group)).toEqual([unchanged]);
    expect(selectWorkspaceChangeCardRows([group], group)).toEqual([group]);
    expect(selectWorkspaceChangeCardRows(rows, null)).toEqual([]);
  });

  it('shows title, priority and missing acceptance for the selected requirement', () => {
    const requirement = { path: 'prd/requirements/service', expandable: true };
    const fields = [
      { path: `${requirement.path}/title`, expandable: false, diff: { exact: true } },
      { path: `${requirement.path}/priority`, expandable: false },
      { path: `${requirement.path}/acceptance`, expandable: false, status: 'missing' },
    ];
    expect(selectWorkspaceChangeCardRows([requirement, ...fields], requirement)).toEqual(fields);
  });
});
