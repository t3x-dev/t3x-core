// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaCatalogExperience } from '@/components/schemas/SchemaCatalogExperience';

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({ workspaces: [], refresh: vi.fn(), error: null }),
}));
vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({ items: [], loading: false, pending: false, add: vi.fn() }),
}));
vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({ projects: [{ project_id: 'p', name: 'Project' }] }),
}));
vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({ projects: [{ project_id: 'p', name: 'Current' }] }),
}));

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  query: '',
  catalog: vi.fn(),
  introduction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  usePathname: () => '/team/project/schemas',
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/hooks/schemas/useSchemaCatalog', () => ({
  useSchemaCatalog: mocks.catalog,
  useSchemaCollections: () => [
    { id: 'infrastructure', title: 'Infrastructure', tags: ['infrastructure'] },
  ],
  useSchemaIntroduction: mocks.introduction,
  useSchemaReleaseReading: () => ({
    loading: false,
    data: {
      artifactHash: 'sha256:abc',
      readme: '# Release definition\n\nKeep configuration changes reviewable.',
      manifest: {
        apiVersion: 't3x.dev/yschema-module/v2',
        canonicalName: 'team/release',
        contribution: {
          nodes: {
            services: {
              required: true,
              repeated: true,
              slots: { image: { type: 'string' } },
              requiredSlots: ['image'],
            },
          },
        },
        starter: { services: { web: { image: 'nginx:1.28-alpine' } } },
      },
    },
  }),
}));
const item = {
  identity: {
    canonicalName: 'team/release',
    displayName: 'Release definition',
    description: 'Review your service configuration.',
    tags: ['infrastructure'],
    family: 'open',
    publisher: 'team',
    ownerProjectId: 'p',
    visibility: 'team',
  },
  release: { artifactVersionId: 'v1', version: '1.2.3', kind: 'schema', hash: 'sha256:abc' },
  definition: {
    pathCount: 4,
    provides: [],
    requires: [],
    nodes: [{ path: 'services', slots: ['image'] }],
  },
  presentationRef: null,
  formats: ['yaml', 'json'],
  license: 'Apache-2.0',
};
beforeEach(() => {
  mocks.query = '';
  mocks.introduction.mockReturnValue({ loading: false });
  mocks.push.mockReset();
  mocks.catalog.mockReturnValue({
    data: { items: [item], has_more: false },
    loading: false,
    retry: vi.fn(),
  });
});
function mount() {
  return render(
    <SchemaCatalogExperience projectId="p">
      <div>Detailed Studio</div>
    </SchemaCatalogExperience>
  );
}
describe('Schema catalog journey', () => {
  it('uses the project avatar in Browse when no separate cover exists', () => {
    mocks.query = 'schemaView=browse';
    mocks.introduction.mockReturnValue({
      data: {
        document: {
          avatarPath: 'avatar.png',
          resources: [
            { path: 'avatar.png', mediaType: 'image/png', base64: 'YXJ0', alt: 'Author art' },
          ],
        },
      },
      loading: false,
    });
    mount();
    const card = screen.getByRole('button', { name: 'Explore Release definition 1.2.3' });
    expect(card.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,YXJ0');
  });
  it('renders the shared Explore surface in Discover and sends search to Browse', () => {
    mocks.query = 'workspace=main';
    mount();
    expect(mocks.catalog).toHaveBeenLastCalledWith('p', 'limit=24', false);
    expect(screen.getByRole('heading', { name: 'Curated schemas' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Discover schemas' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Schema picks' })).toBeVisible();
    expect(screen.queryByText('Detailed Studio')).not.toBeInTheDocument();
    const search = screen.getByRole('textbox', { name: 'Search projects and schemas' });
    fireEvent.change(search, {
      target: { value: 'dog care' },
    });
    fireEvent.submit(search.closest('form')!);
    expect(mocks.push).toHaveBeenCalledWith(
      '/team/project/schemas?workspace=main&schemaView=browse&q=dog+care',
      { scroll: false }
    );
  });
  it('opens a dedicated release page instead of stacked drawers', () => {
    mocks.query = 'schemaView=browse';
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Explore Release definition 1.2.3' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.push).toHaveBeenCalledWith(
      '/team/project/schemas?schemaView=release&catalogName=team%2Frelease&catalogVersion=1.2.3&catalogHash=sha256%3Aabc',
      { scroll: false }
    );
  });
  it('renders the selected release as a page with structured definition', () => {
    mocks.query =
      'schemaView=release&catalogName=team%2Frelease&catalogVersion=1.2.3&catalogHash=sha256%3Aabc';
    mount();
    expect(screen.getByRole('heading', { name: 'Release definition' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Definition' })).toHaveTextContent('services');
    expect(screen.getByRole('region', { name: 'Definition' })).toHaveTextContent('image');
    expect(screen.getByRole('region', { name: 'Example' })).toHaveTextContent('nginx:1.28-alpine');
    expect(screen.getByRole('region', { name: 'Author README' })).toHaveTextContent(
      'Keep configuration changes reviewable'
    );
    fireEvent.click(screen.getByText('Exact source'));
    expect(screen.getAllByText('sha256:abc').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Inspect source YAML'));
    expect(screen.getByText(/canonicalName: team\/release/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add & open Studio' })).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Schema views' })).not.toBeInTheDocument();
  });
  it('restores Browse filters and keeps the advanced workbench behind an explicit action', () => {
    mocks.query = 'schemaView=browse&tags=infra&format=yaml';
    const { unmount } = mount();
    expect(mocks.catalog).toHaveBeenLastCalledWith('p', 'tags=infra&format=yaml&limit=24', true);
    expect(screen.getByRole('complementary', { name: 'Catalog filters' })).toBeInTheDocument();
    unmount();
    mocks.query = 'schemaView=studio';
    mount();
    const schemaViews = screen.getByRole('navigation', { name: 'Schema views' });
    expect(
      within(schemaViews)
        .getAllByRole('tab')
        .map((button) => button.textContent)
    ).toEqual(['Discover', 'Browse', 'Studio']);
    expect(within(schemaViews).queryByRole('tab', { name: 'Active' })).not.toBeInTheDocument();
    expect(within(schemaViews).getByRole('tab', { name: 'Studio' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const studio = screen.getByRole('region', { name: 'Schema Studio' });
    expect(schemaViews.parentElement?.nextElementSibling).toBe(studio);
    expect(screen.queryByText('Detailed Studio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced definition workbench' }));
    expect(screen.getByText('Detailed Studio')).toBeVisible();
    expect(mocks.catalog).toHaveBeenLastCalledWith('p', 'limit=24', false);
  });
});

it('keeps a project introduction link on the release page', () => {
  mocks.query =
    'schemaView=release&catalogName=team%2Frelease&catalogVersion=1.2.3&catalogHash=sha256%3Aabc';
  mocks.catalog.mockReturnValue({
    data: {
      items: [
        {
          ...item,
          presentationRef: {
            projectId: 'source',
            commitDigest: 'sha256:exact',
            presentationDigest: 'sha256:presentation',
          },
        },
      ],
    },
    loading: false,
  });
  mount();
  const href = new URL(
    screen.getByRole('link', { name: 'Project introduction' }).getAttribute('href')!,
    'https://t3x.test'
  );
  expect(href.pathname).toBe('/project/source');
  expect(href.searchParams.get('view')).toBe('overview');
  expect(href.searchParams.get('commit')).toBe('sha256:exact');
  expect(href.searchParams.get('studioTarget')).toBe('p');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
