// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ExploreExperience } from '@/components/explore/ExploreExperience';

const mocks = vi.hoisted(() => ({
  query: '',
  push: vi.fn(),
  catalog: vi.fn(),
  publicProjects: vi.fn(),
  publicProject: vi.fn(),
  release: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/infrastructure/explore', () => ({
  fetchPublicProjects: mocks.publicProjects,
  fetchPublicProject: mocks.publicProject,
  fetchExploreRelease: mocks.release,
  fetchSchemaTargets: vi.fn(),
}));
vi.mock('@/hooks/schemas/useSchemaCatalog', () => ({
  useSchemaCatalog: mocks.catalog,
  useSchemaCollections: () => [{ id: 'work-life', title: 'Work & Life', tags: ['care'] }],
  useSchemaIntroduction: () => ({}),
  useSchemaReleaseReading: () => ({ data: { readme: '# Schema', manifest: {} } }),
}));
vi.mock('@/components/project/StateAuthorReadme', () => ({
  StateAuthorReadme: ({ author }: { author: { readme: string } }) => <p>{author.readme}</p>,
}));
const item = {
  identity: {
    canonicalName: 't3x/care-checklist',
    displayName: 'Care checklist',
    description: 'An everyday routine.',
    tags: ['care'],
    family: 'open',
    publisher: 't3x',
    ownerProjectId: null,
    visibility: 'official',
  },
  release: { artifactVersionId: 'care-1', version: '1.0.0', hash: 'sha256:exact', kind: 'schema' },
  definition: { pathCount: 6, nodes: [] },
  presentationRef: null,
  license: 'MIT',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = '';
  mocks.catalog.mockReturnValue({
    loading: false,
    data: { items: [item], has_more: false },
    retry: vi.fn(),
  });
  mocks.publicProjects.mockResolvedValue({
    items: [
      {
        projectId: 'public',
        name: 'Garden',
        namespace: 'community',
        description: 'Plants',
        tags: ['plants'],
        repositoryPath: null,
      },
    ],
    next_cursor: null,
    has_more: false,
  });
  mocks.publicProject.mockResolvedValue({
    projectId: 'public',
    name: 'Garden',
    namespace: 'community',
    description: 'Plants',
    tags: ['plants'],
    readme: '# A public introduction',
    repositoryPath: null,
  });
  mocks.release.mockResolvedValue({ item });
});
it('uses real editorial releases and public projects while retaining visual cards', async () => {
  const { container } = render(<ExploreExperience />);
  expect(await screen.findByRole('button', { name: 'Garden', exact: true })).toBeInTheDocument();
  expect(mocks.catalog).toHaveBeenCalledWith(null, 'selection=editor-picks&limit=3', true);
  expect(container.querySelector('img[src*="care.jpg"]')).not.toBeNull();
  expect(screen.queryByText('128')).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Explore Care checklist' })[0]);
  const route = new URL(mocks.push.mock.calls.at(-1)![0], 'http://local');
  expect(route.pathname).toBe('/explore');
  expect(route.searchParams.get('catalogHash')).toBe('sha256:exact');
  expect(route.searchParams.has('studioTarget')).toBe(false);
});
it('sends filters to the schema server while keeping public project paging independent', async () => {
  mocks.query = 'view=browse&type=all&q=garden&publisher=alice&projectTag=plants';
  render(<ExploreExperience />);
  await waitFor(() => expect(mocks.publicProjects).toHaveBeenCalled());
  const schemaQuery = new URLSearchParams(mocks.catalog.mock.calls[0][1]);
  expect(schemaQuery.get('publisher')).toBe('alice');
  expect(schemaQuery.get('q')).toBe('garden');
  const projectQuery = new URLSearchParams(mocks.publicProjects.mock.calls[0][0]);
  expect(projectQuery.get('tag')).toBe('plants');
  expect(projectQuery.has('publisher')).toBe(false);
  expect(screen.getByRole('heading', { name: 'Schemas', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Public projects', exact: true })).toBeInTheDocument();
  const navigation = within(screen.getByRole('navigation', { name: 'Global' }));
  expect(navigation.getByRole('link', { name: 'Browse' })).toHaveAttribute('aria-current', 'page');
  expect(navigation.getByRole('link', { name: 'Discover' })).not.toHaveAttribute('aria-current');
  const discover = new URL(
    navigation.getByRole('link', { name: 'Discover' }).getAttribute('href')!,
    'http://local'
  );
  expect(Object.fromEntries(discover.searchParams)).toEqual({
    view: 'discover',
    type: 'all',
    q: 'garden',
    publisher: 'alice',
    projectTag: 'plants',
  });
  expect(screen.queryByRole('navigation', { name: 'Explore views' })).not.toBeInTheDocument();
});
it('resolves a release directly even when it is not on a loaded catalog page', async () => {
  mocks.query = 'catalogName=t3x%2Fcare-checklist&catalogVersion=1.0.0&catalogHash=sha256%3Aexact';
  render(<ExploreExperience />);
  expect(await screen.findByRole('heading', { name: 'Care checklist' })).toBeInTheDocument();
  expect(mocks.release).toHaveBeenCalledWith(
    'canonicalName=t3x%2Fcare-checklist&version=1.0.0&expectedHash=sha256%3Aexact'
  );
  expect(mocks.catalog.mock.calls.every((call) => call[2] === false)).toBe(true);
  expect(screen.getByRole('button', { name: 'Use Schema' })).toBeEnabled();
  const navigation = within(screen.getByRole('navigation', { name: 'Global' }));
  expect(navigation.getByRole('link', { name: 'Browse' })).toHaveAttribute(
    'href',
    '/explore?view=browse'
  );
  expect(screen.getByRole('button', { name: 'Back to Discover' })).toBeInTheDocument();
});
it('shows a public introduction without inventing permission to open project contents', async () => {
  mocks.query = 'view=browse&type=projects&project=public';
  render(<ExploreExperience />);
  expect(await screen.findByText('# A public introduction')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Open project' })).not.toBeInTheDocument();
  const navigation = within(screen.getByRole('navigation', { name: 'Global' }));
  expect(navigation.getByRole('link', { name: 'Browse' })).toHaveAttribute(
    'href',
    '/explore?view=browse&type=projects'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back to Browse' }));
  expect(mocks.push).toHaveBeenCalledWith('/explore?view=browse&type=projects', { scroll: false });
});
