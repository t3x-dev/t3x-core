import { describe, expect, it } from 'vitest';
import { deriveProjectName } from '@/hooks/projects/useAutoProject';

describe('deriveProjectName', () => {
  it('limits auto-created project names to roughly 30 characters at word boundaries', () => {
    const title = deriveProjectName('one two three four five six seven eight nine ten');

    expect(title).toBe('One Two Three Four Five Six');
    expect(title.length).toBeLessThanOrEqual(30);
  });
});
