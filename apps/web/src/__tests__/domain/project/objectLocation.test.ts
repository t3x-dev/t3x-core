import { expect, it } from 'vitest';
import {
  commitStructureHref,
  historyCommitHref,
  repositoryObjectHref,
} from '@/domain/project/objectLocation';

it('keeps numbered commit identity outside a branch while retaining its filtered History source', () => {
  const source =
    '/team/repo/branches/feature%2Frelease/history?q=fix&returnTo=%2Fteam%2Frepo%2Fbranches%2Ffeature%252Frelease';
  const target = new URL(
    historyCommitHref(source, { hash: 'sha256:old', address_number: '42' }),
    'http://local'
  );
  expect(target.pathname).toBe('/team/repo/history/42');
  expect(target.searchParams.get('returnTo')).toBe(source);
  expect(target.searchParams.get('q')).toBe('fix');
  expect(target.searchParams.has('branch')).toBe(false);
  expect(
    commitStructureHref('/team/repo', {
      project_id: 'p',
      hash: 'sha256:old',
      branch: 'dev',
      address_number: '42',
    })
  ).toBe('/team/repo/commits/42?view=structure');
});

it('preserves an old numbered History branch filter through its return path', () => {
  const href = repositoryObjectHref(
    '/team/repo',
    'history',
    '42',
    new URLSearchParams('branch=dev&q=fix')
  );
  const url = new URL(href, 'http://local');
  expect(url.pathname).toBe('/team/repo/history/42');
  expect(url.searchParams.has('branch')).toBe(false);
  expect(url.searchParams.get('returnTo')).toBe('/team/repo/branches/dev/history?q=fix');
});
