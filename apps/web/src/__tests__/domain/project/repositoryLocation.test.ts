import { expect, it } from 'vitest';
import { getProjectTabSegment, PROJECT_TABS } from '@/components/project/projectTabModel';
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
  expect(repositoryLocation('/team/Repo', '/pull-requests', 'pr=42')).toBe(
    '/team/Repo/pull-requests?pr=42'
  );
});

it.each(PROJECT_TABS)('accepts the public route generated for $label', ({ id }) => {
  const segment = getProjectTabSegment(id);
  expect(isSupportedRepositorySuffix(`/${segment}`)).toBe(true);
  expect(isSupportedRepositorySuffix(`/${segment}/`)).toBe(true);
  expect(repositoryLocation('/team/Repo', '', `tab=${segment}&branch=main&pr=42`, '#details')).toBe(
    `/team/Repo${id === 'state' ? '' : `/${segment}`}?branch=main&pr=42#details`
  );
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
    '/reviews',
    '/reviews/extra',
    '/pull-requests/extra',
    '/unknown',
  ])
    expect(isSupportedRepositorySuffix(suffix)).toBe(false);
});
