import { describe, expect, it } from 'vitest';
import { buildReturnTo, safeInternalReturnTo, withReturnTo } from '@/utils/navigationReturn';

describe('navigationReturn', () => {
  it('builds a return path with query string', () => {
    expect(buildReturnTo('/chat/project/proj_1/canvas', 'viewport=1')).toBe(
      '/chat/project/proj_1/canvas?viewport=1'
    );
    expect(buildReturnTo('/chat/project/proj_1/canvas', '?zoom=0.51&x=421')).toBe(
      '/chat/project/proj_1/canvas?zoom=0.51&x=421'
    );
  });

  it('appends returnTo to plain and queried hrefs', () => {
    expect(withReturnTo('/project/proj_1/merge/draft_1', '/chat/project/proj_1/canvas')).toBe(
      '/project/proj_1/merge/draft_1?returnTo=%2Fchat%2Fproject%2Fproj_1%2Fcanvas'
    );
    expect(withReturnTo('/project/proj_1/diff?base=a', '/chat/project/proj_1/canvas')).toBe(
      '/project/proj_1/diff?base=a&returnTo=%2Fchat%2Fproject%2Fproj_1%2Fcanvas'
    );
  });

  it('accepts only same-app absolute paths for returnTo', () => {
    expect(safeInternalReturnTo('/chat/project/proj_1/canvas?x=1', '/fallback')).toBe(
      '/chat/project/proj_1/canvas?x=1'
    );
    expect(safeInternalReturnTo('https://example.com/project', '/fallback')).toBe('/fallback');
    expect(safeInternalReturnTo('//example.com/project', '/fallback')).toBe('/fallback');
    expect(safeInternalReturnTo('project/proj_1', '/fallback')).toBe('/fallback');
  });
});
