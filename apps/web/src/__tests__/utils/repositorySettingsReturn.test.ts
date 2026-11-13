// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import {
  carryRepositorySettingsReturn,
  readRepositorySettingsReturn,
  rememberRepositorySettingsReturn,
  repositorySettingsHistoryData,
} from '@/utils/repositorySettingsReturn';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  readRepositorySettingsReturn('');
});

it('keeps the source on the Settings history entry, including after a section change', () => {
  const source = '/team/Repo/community?branch=feature%2Fnotes#activity';
  const settings = '/team/Repo/settings';
  window.history.replaceState(null, '', source);
  rememberRepositorySettingsReturn('project', settings);
  window.history.pushState(null, '', settings);
  expect(readRepositorySettingsReturn('project')).toBe(source);
  window.history.replaceState(repositorySettingsHistoryData(), '', '#autopilot');
  expect(readRepositorySettingsReturn('project')).toBe(source);
  expect(window.location.href).toMatch(/\/settings#autopilot$/);

  window.history.pushState(null, '', settings);
  expect(readRepositorySettingsReturn('project')).toBe('');
});

it('cleans a legacy Settings bookmark while preserving its source, query and fragment', () => {
  const source = '/team/Repo/checks?kind=review';
  window.history.replaceState(
    null,
    '',
    `/team/Repo/settings?keep=yes&returnTo=${encodeURIComponent(source)}#autopilot`
  );
  expect(readRepositorySettingsReturn('project')).toBe(source);
  expect(window.location.search).toBe('?keep=yes');
  expect(window.location.hash).toBe('#autopilot');
  expect(readRepositorySettingsReturn('another-project')).toBe('');
});

it('carries the source across a Settings address change', () => {
  window.history.replaceState(null, '', '/team/Old/community');
  rememberRepositorySettingsReturn('project', '/project/id/settings');
  window.history.pushState(null, '', '/project/id/settings');
  expect(readRepositorySettingsReturn('project')).toBe('/team/Old/community');
  carryRepositorySettingsReturn('project', '/team/Repo/settings');
  window.history.replaceState(null, '', '/team/Repo/settings');
  expect(readRepositorySettingsReturn('project')).toBe('/team/Old/community');
});

it('preserves a same-repository ID source and its legacy tab parameters', () => {
  const source = '/project/project?tab=pull-requests&pr=7&branch=feature%2Fnotes#discussion';
  window.history.replaceState(
    null,
    '',
    `/team/Repo/settings?returnTo=${encodeURIComponent(source)}`
  );
  expect(readRepositorySettingsReturn('project')).toBe(source);
  expect(readRepositorySettingsReturn('project')).toBe(source);
});

it('keeps a legacy source on a historical address after the resolver verifies the alias', () => {
  const source = '/team/Old/community?branch=feature%2Fnotes#activity';
  const query = `?returnTo=${encodeURIComponent(source)}`;
  window.history.replaceState(null, '', `/team/Old/settings${query}`);
  carryRepositorySettingsReturn('project', '/team/Repo/settings', '/team/Old');
  window.history.replaceState(null, '', `/team/Repo/settings${query}`);
  expect(readRepositorySettingsReturn('project')).toBe(source);
  expect(readRepositorySettingsReturn('project')).toBe(source);
});

it.each([
  '//other.example/',
  '/a/..//other.example/',
  '/invite#token=synthetic',
  '/team/Other/community',
  '/project/other/community',
  '/team/Repo/outputs',
  '/team/Repo?tab=outputs',
  '/team/Repo/settings/',
  '/team/Repo?tab=settings',
  '/team/Repo/unrecognized',
])('cleans an unsupported legacy return %s and uses the fallback', (source) => {
  window.history.replaceState(
    null,
    '',
    `/team/Repo/settings?returnTo=${encodeURIComponent(source)}`
  );
  expect(readRepositorySettingsReturn('project')).toBe('');
  expect(readRepositorySettingsReturn('project')).toBe('');
  expect(window.location.search).toBe('');
});
