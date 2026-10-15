import { expect, it } from 'vitest';
import {
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';

it('keeps page context while collapsing historical/case/ID addresses in one step', () => {
  expect(
    repositoryLocation(
      '/team/HoloCure_fishing_auto',
      '',
      'tab=workspaces&workspace=w&conversation=c&branch=release&pr=42',
      '#details'
    )
  ).toBe(
    '/team/HoloCure_fishing_auto/workspaces?workspace=w&conversation=c&branch=release&pr=42#details'
  );
  const location = repositoryLocation(
    '/team/Repo',
    '/changes/ws/snapshot',
    'branch=main&returnTo=%2Fteam%2FOld',
    '#diff'
  );
  expect(location).toBe('/team/Repo/changes/ws/snapshot?branch=main&returnTo=%2Fteam%2FOld#diff');
  expect(repositoryLocation('/team/Repo', '/reviews', 'pr=42')).toBe('/team/Repo/reviews?pr=42');
});

it('only migrates explicitly supported nested routes', () => {
  for (const suffix of [
    '',
    '/settings',
    '/history',
    '/diff',
    '/merge/m',
    '/leaf/l',
    '/changes/w/s',
    '/sources/conversations/c',
  ])
    expect(isSupportedRepositorySuffix(suffix)).toBe(true);
  for (const suffix of [
    '/settings/unknown',
    '/commit/legacy',
    '/draft/d',
    '/reviews/extra',
    '/unknown',
  ])
    expect(isSupportedRepositorySuffix(suffix)).toBe(false);
});
