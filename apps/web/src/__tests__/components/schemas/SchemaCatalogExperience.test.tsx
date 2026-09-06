// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaCatalogExperience } from '@/components/schemas/SchemaCatalogExperience';

const mocks = vi.hoisted(() => ({ push: vi.fn(), query: '', catalog: vi.fn() }));
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
  useSchemaIntroduction: () => ({ loading: false }),
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
  license: null,
};
beforeEach(() => {
  mocks.query = '';
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
  it('keeps Discover visual and sends search to Browse, preserving workspace context', () => {
    mocks.query = 'workspace=main';
    mount();
    expect(screen.getByRole('heading', { name: 'What will you define next?' })).toBeVisible();
    expect(screen.queryByText('Detailed Studio')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search definitions' }), {
      target: { value: 'dog care' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
    expect(mocks.push).toHaveBeenCalledWith(
      '/team/project/schemas?workspace=main&schemaView=browse&q=dog+care',
      { scroll: false }
    );
  });
  it('opens an exact release in Studio without applying it to a workspace', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Explore Release definition 1.2.3' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('sha256:abc')).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in Studio' }));
    expect(mocks.push).toHaveBeenCalledWith(
      '/team/project/schemas?schemaView=studio&mode=versions&catalogName=team%2Frelease&catalogVersion=1.2.3',
      { scroll: false }
    );
  });
  it('restores Browse filters from the URL and leaves Studio to the existing workbench', () => {
    mocks.query = 'schemaView=browse&tags=infra&format=yaml';
    const { unmount } = mount();
    expect(mocks.catalog).toHaveBeenLastCalledWith('p', 'tags=infra&format=yaml&limit=24', true);
    expect(screen.getByRole('complementary', { name: 'Catalog filters' })).toBeInTheDocument();
    unmount();
    mocks.query = 'schemaView=studio';
    mount();
    expect(screen.getByText('Detailed Studio')).toBeVisible();
    expect(mocks.catalog).toHaveBeenLastCalledWith('p', 'limit=24', false);
  });
});
