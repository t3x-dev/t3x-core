import { describe, expect, it } from 'vitest';
import {
  formatSchemaReleaseName,
  getSchemaReleaseBadgeTone,
  groupSchemaReleasesByFamily,
} from '@/domain/schemas/selectors';
import type { SchemaRelease } from '@/types/schemas';

const releases: SchemaRelease[] = [
  {
    id: 'schema_prd_v3',
    projectId: 'proj_test',
    name: 'PRD Schema',
    version: 'v3',
    status: 'draft',
    usedByCommitCount: 0,
    usedByWorkspaceCount: 1,
    breakingChangeLevel: 'minor',
  },
  {
    id: 'schema_prd_v2',
    projectId: 'proj_test',
    name: 'PRD Schema',
    version: 'v2',
    status: 'active',
    releasedAt: '2026-06-20T00:00:00.000Z',
    releasedBy: 'HLQ',
    usedByCommitCount: 8,
    usedByWorkspaceCount: 2,
    breakingChangeLevel: 'none',
  },
  {
    id: 'schema_release_v1',
    projectId: 'proj_test',
    name: 'Release Note Schema',
    version: 'v1',
    status: 'deprecated',
    usedByCommitCount: 1,
    usedByWorkspaceCount: 0,
    breakingChangeLevel: 'breaking',
  },
];

describe('schema selectors', () => {
  it('formats schema releases as simple release-style names', () => {
    expect(formatSchemaReleaseName(releases[1])).toBe('PRD Schema v2');
  });

  it('maps release state to existing semantic badge tones', () => {
    expect(getSchemaReleaseBadgeTone(releases[0])).toBe('pending');
    expect(getSchemaReleaseBadgeTone(releases[1])).toBe('commit');
    expect(getSchemaReleaseBadgeTone(releases[2])).toBe('warning');
  });

  it('groups releases by schema family without losing status order data', () => {
    expect(groupSchemaReleasesByFamily(releases)).toEqual([
      {
        name: 'PRD Schema',
        releases: [releases[0], releases[1]],
      },
      {
        name: 'Release Note Schema',
        releases: [releases[2]],
      },
    ]);
  });
});
