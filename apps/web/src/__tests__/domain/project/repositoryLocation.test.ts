import { expect, it } from 'vitest';
import { getProjectTabSegment, PROJECT_TABS } from '@/components/project/projectTabModel';
import { repositoryBranch } from '@/domain/project/repoPath';
import {
  isRetiredRepositoryLocation,
  isSupportedRepositorySuffix,
  repositoryLocation,
} from '@/domain/project/repositoryLocation';

it.each([
  'main',
  'feature/release',
  '计划 100%',
  'feature%2Fname',
])('round-trips the branch %s once on every branch page', (branch) => {
  for (const section of [
    '',
    '/schemas',
    '/workspaces',
    '/history',
    '/diff',
    '/sources/conversations/source',
  ]) {
    const query = new URLSearchParams({ branch, view: 'structure', workspace: 'exact' });
    const href = repositoryLocation('/team/Repo', section, query.toString(), '#field');
    const url = new URL(href, 'http://local');
    expect(url.pathname).toBe(
      branch === 'main' && !section
        ? '/team/Repo'
        : `/team/Repo/branches/${encodeURIComponent(branch)}${section}`
    );
    expect(url.searchParams.has('branch')).toBe(false);
    expect(repositoryBranch(url.pathname, url.searchParams) ?? 'main').toBe(branch);
    expect(
      repositoryLocation(
        '/team/Repo',
        url.pathname.slice('/team/Repo'.length),
        url.search.slice(1),
        url.hash
      )
    ).toBe(href);
  }
});

it('uses main for a short entry without overriding an explicitly addressed Workspace', () => {
  expect(repositoryLocation('/team/Repo', '', '')).toBe('/team/Repo');
  expect(repositoryLocation('/team/Repo', '/schemas', '')).toBe('/team/Repo/branches/main/schemas');
  expect(repositoryLocation('/team/Repo', '/workspaces', '')).toBe(
    '/team/Repo/branches/main/workspaces'
  );
  for (const section of ['/schemas', '/workspaces']) {
    expect(repositoryLocation('/team/Repo', section, 'workspace=dev-draft')).toBe(
      `/team/Repo${section}?workspace=dev-draft`
    );
  }
});

it('keeps repository-wide pages and exact historical identities independent of branch context', () => {
  for (const section of [
    '/settings',
    '/community',
    '/checks',
    '/pull-requests',
    '/commits/42',
    '/reviews/17',
  ]) {
    expect(repositoryLocation('/team/Repo', section, 'branch=dev&view=structure')).toBe(
      `/team/Repo${section}?view=structure`
    );
  }
  expect(repositoryLocation('/team/Repo', '/history', 'branch=all&q=fix')).toBe(
    '/team/Repo/history?q=fix'
  );
});

it.each([
  '/branches/%ZZ',
  '/branches/%2E',
  '/branches/%2E%2E',
  '/branches//schemas',
  '/branches/main/unknown',
  '/branches/main/reviews/17',
  '/branches/main/checks',
])('rejects the unsupported branch path %s', (suffix) => {
  expect(isSupportedRepositorySuffix(suffix)).toBe(false);
});

it('keeps page context while collapsing historical/case/ID addresses in one step', () => {
  expect(
    repositoryLocation(
      '/team/HoloCure_fishing_auto',
      '',
      'tab=workspaces&workspace=w&conversation=c&branch=release&pr=42',
      '#details'
    )
  ).toBe(
    '/team/HoloCure_fishing_auto/branches/release/workspaces?workspace=w&conversation=c&pr=42#details'
  );
  const location = repositoryLocation(
    '/team/Repo',
    '/changes/ws/snapshot',
    'branch=main&returnTo=%2Fteam%2FOld',
    '#diff'
  );
  expect(location).toBe('/team/Repo/changes/ws/snapshot?returnTo=%2Fteam%2FOld#diff');
  expect(repositoryLocation('/team/Repo', '/pull-requests', 'pr=42')).toBe(
    '/team/Repo/pull-requests?pr=42'
  );
});

it.each(PROJECT_TABS)('accepts the public route generated for $label', ({ id }) => {
  const segment = getProjectTabSegment(id);
  expect(isSupportedRepositorySuffix(`/${segment}`)).toBe(true);
  expect(isSupportedRepositorySuffix(`/${segment}/`)).toBe(true);
  expect(repositoryLocation('/team/Repo', '', `tab=${segment}&branch=main&pr=42`, '#details')).toBe(
    id === 'state'
      ? '/team/Repo?pr=42#details'
      : ['schemas', 'workspaces'].includes(id)
        ? `/team/Repo/branches/main/${segment}?pr=42#details`
        : `/team/Repo/${segment}?pr=42#details`
  );
});

it('preserves encoded branch identity and lets the path override a conflicting query', () => {
  const suffix = '/branches/feature%2F100%25/workspaces';
  expect(isSupportedRepositorySuffix(suffix)).toBe(true);
  expect(repositoryLocation('/team/Repo', suffix, 'branch=other&reviewPane=yaml', '#draft')).toBe(
    `/team/Repo${suffix}?reviewPane=yaml#draft`
  );
  expect(
    repositoryLocation('/team/Repo', '/workspaces', 'branch=main&workspace=w&reviewSnapshot=r')
  ).toBe('/team/Repo/branches/main/workspaces?workspace=w&reviewSnapshot=r');
});

it.each([
  { view: 'discover', path: '/discover', retainedView: null },
  { view: 'browse', path: '/browse', retainedView: null },
  { view: 'active', path: '/schemas', retainedView: 'active' },
  { view: 'release', path: '/browse', retainedView: 'release' },
])('migrates legacy Schema $view links without losing their context', ({
  view,
  path,
  retainedView,
}) => {
  const context =
    'branch=feature%2Frelease&workspace=workspace_branch%3Afeature%2Frelease&q=dog+care&tags=infra&format=yaml&catalogName=team%2Fschema&catalogVersion=1.2.3&catalogHash=sha256%3Aabc';
  const expectedQuery = `${retainedView ? `schemaView=${retainedView}&` : ''}${context.replace('branch=feature%2Frelease&', '')}`;
  for (const suffix of ['', '/schemas', '/schemas/']) {
    const query = `${suffix ? '' : 'tab=schemas&'}schemaView=${view}&${context}`;
    const result = repositoryLocation('/team/Repo', suffix, query, '#definition');
    expect(result).toBe(`/team/Repo/branches/feature%2Frelease${path}?${expectedQuery}#definition`);
    expect(
      repositoryLocation(
        '/team/Repo',
        `/branches/feature%2Frelease${path}`,
        expectedQuery,
        '#definition'
      )
    ).toBe(result);
  }
});

it('keeps the Schemas route available without a catalog view parameter', () => {
  expect(repositoryLocation('/team/Repo', '', 'tab=schemas&branch=main&workspace=w')).toBe(
    '/team/Repo/branches/main/schemas?workspace=w'
  );
  expect(repositoryLocation('/team/Repo', '/schemas', 'branch=main&workspace=w')).toBe(
    '/team/Repo/branches/main/schemas?workspace=w'
  );
});

it('drops the default Run return path and keeps filtered list context', () => {
  expect(
    repositoryLocation('/team/Repo', '/checks/review%3Ar12', 'returnTo=%2Fteam%2FRepo%2Fchecks')
  ).toBe('/team/Repo/checks/review%3Ar12');
  expect(
    repositoryLocation(
      '/team/Repo',
      '/checks/review%3Ar12',
      'returnTo=%2Fteam%2FRepo%2Fchecks%3Fkind%3Dreview'
    )
  ).toBe('/team/Repo/checks/review%3Ar12?returnTo=%2Fteam%2FRepo%2Fchecks%3Fkind%3Dreview');
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

it.each([
  '',
  '/state',
  '/branches/main',
  '/branches/main/',
  '/branches/main/state',
])('keeps the default State at the repository root for %s', (suffix) => {
  const href = repositoryLocation('/team/Repo', suffix, 'branch=main&view=structure', '#field');
  expect(href).toBe('/team/Repo?view=structure#field');
  expect(repositoryLocation('/team/Repo', '', 'view=structure', '#field')).toBe(href);
});
it('lets an explicit main path win over a conflicting branch query before shortening', () => {
  expect(repositoryLocation('/team/Repo', '/branches/main', 'branch=dev&view=code')).toBe(
    '/team/Repo?view=code'
  );
  expect(repositoryLocation('/team/Repo', '', 'branch=dev&view=code')).toBe(
    '/team/Repo/branches/dev?view=code'
  );
});
