import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPOSITORY_NAVIGATION_OWNERS = [
  'app/chat/[conversationId]/page.tsx',
  'app/project/[projectId]/diff/page.tsx',
  'app/project/[projectId]/merge/[mergeId]/page.tsx',
  'components/chat/ChatSidebar.tsx',
  'components/commit/CommitDetailPage.tsx',
  'components/diff/DiffPage.tsx',
];

describe('repository Canvas and Outputs links', () => {
  it('keeps production navigation off compatibility routes under the Chat shell', () => {
    const offenders = REPOSITORY_NAVIGATION_OWNERS.filter((relativePath) => {
      const source = readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');
      return source.includes('/chat/project/');
    });

    expect(offenders).toEqual([]);
  });
});
