import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  },
}));

import RetiredChatLeafRoute from '@/app/chat/project/[projectId]/leaf/[[...retired]]/page';
import RetiredLeafRoute from '@/app/project/[projectId]/leaf/[[...retired]]/page';
import RetiredOutputsRoute from '@/app/project/[projectId]/outputs/[[...retired]]/page';
import RetiredPromptArchiveRoute from '@/app/templates/archive/[[...retired]]/page';

describe('retired Legacy pages', () => {
  it.each([
    ['Leaf', RetiredLeafRoute],
    ['Outputs', RetiredOutputsRoute],
    ['Chat Leaf alias', RetiredChatLeafRoute],
    ['Prompt archive', RetiredPromptArchiveRoute],
  ])('%s terminates with not found', (_name, page) => {
    expect(page).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });
});
