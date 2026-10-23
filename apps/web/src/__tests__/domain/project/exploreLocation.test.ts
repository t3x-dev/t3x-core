import { expect, it } from 'vitest';
import { legacyExploreLocation, safeExploreReturn } from '@/domain/project/exploreLocation';

it('returns old binding links to the editor with their destination context', () => {
  const url = new URL(
    legacyExploreLocation('p', 'browse', 'schemaView=active&workspace=workspace_branch%3Amain'),
    'http://local'
  );
  expect(url.pathname).toBe('/project/p');
  expect(url.searchParams.get('tab')).toBe('schemas');
  expect(url.searchParams.get('schemaView')).toBe('studio');
  expect(url.searchParams.get('workspace')).toBe('workspace_branch:main');
});
it('only carries a local Explore return path through creation and Studio', () => {
  for (const value of [
    'https://outside.test',
    '//outside.test',
    '/explore/../settings',
    '/explore\\outside',
    '/explore\n',
    '/explorer',
    '/settings',
  ])
    expect(safeExploreReturn(value)).toBeUndefined();
  expect(safeExploreReturn('/explore?catalogName=team%2Fdefinition')).toBe(
    '/explore?catalogName=team%2Fdefinition'
  );
});
