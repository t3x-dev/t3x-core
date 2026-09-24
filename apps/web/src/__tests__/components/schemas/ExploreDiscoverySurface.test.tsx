// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExploreDiscoverySurface } from '@/components/schemas/ExploreDiscoverySurface';

const mocks = vi.hoisted(() => ({ query: '', push: vi.fn(), catalog: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/templates',
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock('@/hooks/schemas/useSchemaCatalog', () => ({ useSchemaCatalog: mocks.catalog }));
vi.mock('@/components/schemas/CatalogLogo', () => ({
  CatalogLogo: () => <span aria-hidden="true" />,
}));
vi.mock('@/components/schemas/AddToStudio', () => ({
  AddToStudio: ({ defaultProjectId }: { defaultProjectId: string }) => (
    <div data-testid="add-to-studio" data-project={defaultProjectId} />
  ),
}));

const item = {
  identity: {
    canonicalName: 't3x/brief',
    displayName: 'Brief',
    description: 'Published brief',
    publisher: 'T3X',
    visibility: 'official',
    tags: [],
    ownerProjectId: null,
  },
  release: { artifactVersionId: 'v1', version: '1.0', hash: 'sha256:abc', kind: 'schema' },
  definition: { pathCount: 2 },
};

describe('ExploreDiscoverySurface', () => {
  it('uses editorial selection until searching, then sends only q', () => {
    mocks.query = '';
    mocks.catalog.mockReturnValue({
      data: { items: [item], has_more: false },
      loading: false,
      error: null,
    });
    render(<ExploreDiscoverySurface />);
    expect(mocks.catalog).toHaveBeenCalledWith(null, 'selection=editor-picks&limit=24', true);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'brief' } });
    fireEvent.submit(screen.getByRole('searchbox').closest('form')!);
    expect(mocks.catalog).toHaveBeenLastCalledWith(null, 'q=brief&limit=24', true);
  });

  it('keeps release identity in the URL and requires a project for Studio', () => {
    mocks.query = 'catalogName=t3x%2Fbrief&catalogVersion=1.0&catalogHash=sha256%3Aabc';
    mocks.catalog.mockReturnValue({
      data: { items: [item], has_more: false },
      loading: false,
      error: null,
    });
    render(<ExploreDiscoverySurface />);
    expect(screen.getByRole('heading', { name: 'Brief' })).toBeInTheDocument();
    expect(screen.getByTestId('add-to-studio')).toHaveAttribute('data-project', '');
  });

  it('offers the next catalog page before declaring an older release unavailable', () => {
    mocks.query = 'catalogName=t3x%2Fbrief&catalogVersion=0.9&catalogHash=sha256%3Aold';
    const loadMore = vi.fn();
    mocks.catalog.mockReturnValue({
      data: { items: [item], has_more: true },
      loading: false,
      error: null,
      loadMore,
    });
    render(<ExploreDiscoverySurface />);
    expect(screen.queryByText('Release not found or unavailable.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search more releases' }));
    expect(loadMore).toHaveBeenCalledOnce();
  });
});
