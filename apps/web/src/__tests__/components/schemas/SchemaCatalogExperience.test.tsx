// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaCatalogExperience } from '@/components/schemas/SchemaCatalogExperience';

vi.mock('@/hooks/workspaces/useProjectWorkspaces', () => ({
  useProjectWorkspaces: () => ({ workspaces: [], refresh: vi.fn(), error: null }),
}));
vi.mock('@/hooks/schemas/useStudioCandidates', () => ({
  useStudioCandidates: () => ({ items: [], loading: false }),
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
  useSchemaReleaseReading: () => ({ loading: false }),
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
  },
  release: { artifactVersionId: 'v1', version: '1.2.3', kind: 'schema', hash: 'sha256:abc' },
  definition: { pathCount: 4, provides: [], requires: [] },
  presentationRef: null,
  formats: ['yaml', 'json'],
  license: null,
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
  it('offers one Add to Studio action for an exact release', () => {
    mocks.query = 'schemaView=browse';
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Explore Release definition 1.2.3' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Exact source'));
    expect(within(dialog).getByText('sha256:abc')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Add to Studio' })).toBeEnabled();
    expect(
      within(dialog).queryByRole('button', { name: 'Open in Studio' })
    ).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
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

it('opens a published project introduction at its pinned State revision', () => {
  mocks.query = 'schemaView=browse';
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
  fireEvent.click(screen.getByRole('button', { name: 'Explore Release definition 1.2.3' }));
  const href = new URL(mocks.push.mock.calls[0]![0], 'https://t3x.test');
  expect(href.pathname).toBe('/project/source');
  expect(href.searchParams.get('view')).toBe('overview');
  expect(href.searchParams.get('commit')).toBe('sha256:exact');
  expect(href.searchParams.get('studioTarget')).toBe('p');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
