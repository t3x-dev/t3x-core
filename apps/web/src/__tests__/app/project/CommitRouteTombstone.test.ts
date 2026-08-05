import { describe, expect, it, vi } from 'vitest';

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn((): never => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

import RetiredCommitRoute from '@/app/project/[projectId]/commit/[[...retired]]/page';

describe('retired commit detail route', () => {
  it('always terminates with a Next.js not-found response', () => {
    expect(() => RetiredCommitRoute()).toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(notFoundMock).toHaveBeenCalledOnce();
  });
});
