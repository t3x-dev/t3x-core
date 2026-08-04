import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPOSITORY_NAVIGATION_OWNERS = [
  'app/chat/[conversationId]/page.tsx',
  'app/project/[projectId]/diff/page.tsx',
  'app/project/[projectId]/merge/[mergeId]/page.tsx',
  'components/chat/ChatSidebar.tsx',
  'components/diff/DiffPage.tsx',
];

const COMMIT_NAVIGATION_OWNERS = [
  ...REPOSITORY_NAVIGATION_OWNERS,
  'components/history/CommitHistoryPage.tsx',
  'components/history/CommitHistoryRow.tsx',
  'components/project/ProjectStateTab.tsx',
  'components/sources/ConversationSourceEvidencePage.tsx',
];

describe('repository Canvas and Outputs links', () => {
  it('keeps production navigation off compatibility routes under the Chat shell', () => {
    const offenders = REPOSITORY_NAVIGATION_OWNERS.filter((relativePath) => {
      const source = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');
      return source.includes('/chat/project/');
    });

    expect(offenders).toEqual([]);
  });

  it('does not link to the retired per-commit detail route', () => {
    const offenders = COMMIT_NAVIGATION_OWNERS.filter((relativePath) => {
      const source = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');
      return source.includes('/commit/${');
    });

    expect(offenders).toEqual([]);
  });
});
