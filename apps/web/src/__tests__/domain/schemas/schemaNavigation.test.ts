import { expect, it } from 'vitest';
import {
  schemaBrowseHref,
  schemaSourceHref,
  schemaWorkspaceHref,
} from '@/domain/schemas/schemaNavigation';

it('keeps browsing separate from returning to an exact release', () => {
  expect(schemaBrowseHref('project', 'feature-draft', 'feature')).toBe(
    '/explore?view=browse&type=schemas&studioTarget=project&branch=feature&workspace=feature-draft'
  );
  const href = schemaSourceHref(
    '/explore?catalogName=team%2Fbase&catalogHash=sha256%3Aabc&q=care&studioTarget=old&workspace=old&branch=main',
    'project',
    'feature-draft',
    'feature'
  );
  const params = new URL(href!, 'http://local').searchParams;
  expect(params.get('catalogHash')).toBe('sha256:abc');
  expect(params.get('q')).toBe('care');
  expect(params.get('studioTarget')).toBe('project');
  expect(params.get('workspace')).toBe('feature-draft');
  expect(params.get('branch')).toBe('feature');
  expect(schemaSourceHref('https://external.example', 'project')).toBeUndefined();
});
it('switches both Workspace and branch without reusing the previous candidate', () => {
  const href = schemaWorkspaceHref(
    '/team/repo/schemas',
    'workspace=main&branch=main&candidate=old&mode=compose&returnTo=%2Fexplore%3Fq%3Dcare',
    { id: 'feature-draft', targetBranch: 'feature/test' },
    true
  );
  const url = new URL(href, 'http://local');
  expect(url.pathname).toBe('/team/repo/schemas');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    workspace: 'feature-draft',
    branch: 'feature/test',
    schemaView: 'studio',
    returnTo: '/explore?q=care',
  });
});
it('preserves the incoming candidate when normalizing an initial target', () => {
  const href = schemaWorkspaceHref('/project/p', 'tab=schemas&candidate=exact', {
    id: 'draft',
    targetBranch: 'main',
  });
  const params = new URL(href, 'http://local').searchParams;
  expect(params.get('candidate')).toBe('exact');
  expect(params.get('tab')).toBe('schemas');
});
