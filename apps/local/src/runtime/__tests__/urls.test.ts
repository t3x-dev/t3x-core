import { describe, expect, it } from 'vitest';
import { buildRepositoryEntryUrl, REPOSITORY_WEBUI_ENTRY_PATH } from '../urls.js';

describe('buildRepositoryEntryUrl', () => {
  it('opens the repository-first WebUI root', () => {
    expect(buildRepositoryEntryUrl('http://localhost:3000')).toBe('http://localhost:3000/');
  });

  it('preserves custom local web ports', () => {
    expect(buildRepositoryEntryUrl('http://localhost:3100')).toBe('http://localhost:3100/');
  });

  it('does not route local launches through the retired Chat surface', () => {
    const url = new URL(buildRepositoryEntryUrl('http://localhost:3000'));

    expect(url.pathname).toBe(REPOSITORY_WEBUI_ENTRY_PATH);
    expect([...url.searchParams.entries()]).toEqual([]);
    expect(url.pathname).not.toContain('/chat');
  });
});
