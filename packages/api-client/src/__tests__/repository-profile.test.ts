import { describe, expect, it } from 'vitest';
import {
  initialRepositoryReadme,
  RepositoryProfilePatchSchema,
  RepositoryReadmeSchema,
  RepositoryTagsSchema,
} from '../repository-profile';

describe('repository profile contract', () => {
  it('normalizes tags without changing case, Unicode or first occurrence order', () => {
    expect(RepositoryTagsSchema.parse([' 中文 ', '', 'Dev', '中文', 'dev', '  '])).toEqual([
      '中文',
      'Dev',
      'dev',
    ]);
    expect(RepositoryTagsSchema.parse(Array(40).fill('same'))).toEqual(['same']);
    expect(RepositoryTagsSchema.parse(['😀'.repeat(64)])).toHaveLength(1);
    expect(RepositoryTagsSchema.safeParse(['中'.repeat(65)]).success).toBe(false);
    expect(
      RepositoryTagsSchema.safeParse(Array.from({ length: 33 }, (_, n) => String(n))).success
    ).toBe(false);
  });
  it('enforces UTF-8 bytes and explicit empty values, leaving omitted fields absent', () => {
    expect(RepositoryReadmeSchema.safeParse('a'.repeat(128 * 1024)).success).toBe(true);
    expect(RepositoryReadmeSchema.safeParse('中'.repeat(44_000)).success).toBe(false);
    expect(RepositoryProfilePatchSchema.parse({ readme: '' })).toEqual({ readme: '' });
    expect(RepositoryProfilePatchSchema.parse({ tags: [' '] })).toEqual({ tags: [] });
    expect(RepositoryProfilePatchSchema.safeParse({ tags: null }).success).toBe(false);
    expect(RepositoryProfilePatchSchema.safeParse({ readme: null }).success).toBe(false);
    expect(RepositoryProfilePatchSchema.safeParse({ description: 'unexpected' }).success).toBe(
      false
    );
  });
  it('only generates the confirmed name and supplied description', () => {
    expect(initialRepositoryReadme('My-Repo', '  Description  ')).toBe(
      '# My-Repo\n\nDescription\n'
    );
    expect(initialRepositoryReadme('My-Repo')).toBe('# My-Repo\n');
  });
});
