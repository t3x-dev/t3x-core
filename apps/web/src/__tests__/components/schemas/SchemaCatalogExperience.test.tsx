// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SchemaCatalogExperience } from '@/components/schemas/SchemaCatalogExperience';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), query: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  usePathname: () => '/team/project/schemas',
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/components/schemas/SchemaStudioExperience', () => ({
  SchemaStudioExperience: () => <div>Project Studio</div>,
}));
beforeEach(() => {
  localStorage.clear();
  mocks.query = '';
  mocks.replace.mockReset();
});
it('opens the editor even when the retired Bindings preference is stored', () => {
  localStorage.setItem('t3x.schemas-view:p', 'active');
  render(<SchemaCatalogExperience projectId="p">{null}</SchemaCatalogExperience>);
  expect(screen.getByText('Project Studio')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Bindings' })).not.toBeInTheDocument();
});
it.each([
  'discover',
  'browse',
] as const)('migrates legacy %s with release, filters and destination context', (tab) => {
  mocks.query =
    'schemaView=release&catalogName=team%2Fexample&catalogVersion=1.0.0&catalogHash=sha256%3Aabc&q=care&workspace=workspace_branch%3Amain&branch=main';
  render(
    <SchemaCatalogExperience projectId="p" tab={tab}>
      {null}
    </SchemaCatalogExperience>
  );
  const destination = new URL(mocks.replace.mock.calls[0][0], 'http://local');
  expect(destination.pathname).toBe('/explore');
  expect(destination.searchParams.get('view')).toBe(tab);
  expect(destination.searchParams.get('catalogHash')).toBe('sha256:abc');
  expect(destination.searchParams.get('workspace')).toBe('workspace_branch:main');
  expect(destination.searchParams.get('studioTarget')).toBe('p');
  expect(destination.searchParams.get('catalogProjectId')).toBe('p');
  expect(destination.searchParams.get('q')).toBe('care');
});
it('opens the editor from a historical Bindings URL', () => {
  mocks.query = 'schemaView=active&workspace=w&branch=release';
  render(<SchemaCatalogExperience projectId="p">{null}</SchemaCatalogExperience>);
  expect(screen.getByText('Project Studio')).toBeInTheDocument();
  expect(screen.queryByText('Workspace bindings')).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Project schemas' })).not.toBeInTheDocument();
});
