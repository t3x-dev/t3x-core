// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProjectSettingsPage from '@/app/project/[projectId]/settings/page';
import { repositoryAgentAccessHref } from '@/domain/project/repoPath';

const repository = vi.hoisted(() => ({
  project_id: 'repo-1',
  name: 'Calendar',
  namespace: 'editor',
  can_edit: true,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: repository.project_id }),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/hooks/projects/useProjectSettings', () => ({
  useProjectSettings: () => ({ project: repository, loading: false, error: null }),
}));

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  repository.can_edit = true;
  window.history.replaceState(
    null,
    '',
    repositoryAgentAccessHref('/editor/calendar', 'release/v2')
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it('opens the authorization preview for the selected repository and branch', async () => {
  render(<ProjectSettingsPage />);

  expect(await screen.findByRole('heading', { name: 'Let Codex work on Calendar?' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'editor/Calendar' })).toHaveAttribute(
    'href',
    '/editor/calendar/branches/release%2Fv2'
  );
  expect(screen.getByText('release/v2', { selector: 'code' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Authorize and start' }));
  expect(screen.getByRole('heading', { name: 'Codex is ready to work' })).toBeVisible();
  expect(screen.getByText(/commit eligible changes to release\/v2/)).toBeVisible();
});

it('keeps a read-only user out of the preview through the same direct link', async () => {
  repository.can_edit = false;
  render(<ProjectSettingsPage />);

  expect(await screen.findByRole('heading', { name: 'Agent access unavailable' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Authorize and start' })).toBeNull();
});
