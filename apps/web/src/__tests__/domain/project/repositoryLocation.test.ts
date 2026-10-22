import { expect, it } from 'vitest';
import { getProjectTabSegment, PROJECT_TABS } from '@/components/project/projectTabModel';
import {
  isRetiredRepositoryLocation,
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

it.each([
  { view: 'discover', path: '/discover', retainedView: null },
  { view: 'browse', path: '/browse', retainedView: null },
  { view: 'active', path: '/browse', retainedView: 'active' },
  { view: 'release', path: '/browse', retainedView: 'release' },
])('migrates legacy Schema $view links without losing their context', ({
  view,
  path,
  retainedView,
}) => {
  const context =
    'branch=feature%2Frelease&workspace=workspace_branch%3Afeature%2Frelease&q=dog+care&tags=infra&format=yaml&catalogName=team%2Fschema&catalogVersion=1.2.3&catalogHash=sha256%3Aabc';
  const expectedQuery = `${retainedView ? `schemaView=${retainedView}&` : ''}${context}`;
  for (const suffix of ['', '/schemas', '/schemas/']) {
    const query = `${suffix ? '' : 'tab=schemas&'}schemaView=${view}&${context}`;
    const result = repositoryLocation('/team/Repo', suffix, query, '#definition');
    expect(result).toBe(`/team/Repo${path}?${expectedQuery}#definition`);
    expect(repositoryLocation('/team/Repo', path, expectedQuery, '#definition')).toBe(result);
  }
});

it('keeps the Schemas route available without a catalog view parameter', () => {
  expect(repositoryLocation('/team/Repo', '', 'tab=schemas&branch=main&workspace=w')).toBe(
    '/team/Repo/schemas?branch=main&workspace=w'
  );
  expect(repositoryLocation('/team/Repo', '/schemas', 'branch=main&workspace=w')).toBe(
    '/team/Repo/schemas?branch=main&workspace=w'
  );
});

it('only migrates explicitly supported nested routes', () => {
  for (const suffix of [
    '',
    '/settings',
    '/history',
    '/diff',
    '/merge/m',
    '/changes/w/s',
    '/sources/conversations/c',
  ])
    expect(isSupportedRepositorySuffix(suffix)).toBe(true);
  for (const suffix of [
    '/outputs',
    '/outputs/',
    '/leaf/l',
    '/settings/unknown',
    '/commit/legacy',
    '/draft/d',
    '/reviews',
    '/reviews/extra',
    '/pull-requests/extra',
    '/discover/extra',
    '/browse/extra',
    '/unknown',
  ])
    expect(isSupportedRepositorySuffix(suffix)).toBe(false);
});

it.each([
  '/outputs',
  '/outputs/',
  '/outputs/extra',
  '/leaf',
  '/leaf/id',
  '/leaf/id/extra',
])('recognizes the retired repository route %s', (suffix) => {
  expect(isRetiredRepositoryLocation(suffix, new URLSearchParams())).toBe(true);
  expect(isSupportedRepositorySuffix(suffix)).toBe(false);
});

it.each(['', '/', '/state', '/state/'])('rejects the old Outputs query on %s', (suffix) => {
  expect(isRetiredRepositoryLocation(suffix, new URLSearchParams('tab=outputs&leaf=old'))).toBe(
    true
  );
});

it.each([
  '/knowledge-graph',
  '/history',
  '/schemas',
  '/browse',
  '/workspaces',
])('keeps the active route %s available', (suffix) => {
  expect(isRetiredRepositoryLocation(suffix, new URLSearchParams())).toBe(false);
  expect(isSupportedRepositorySuffix(suffix)).toBe(true);
});
