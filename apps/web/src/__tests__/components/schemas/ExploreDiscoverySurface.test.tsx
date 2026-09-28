// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExploreDiscoverySurface } from '@/components/schemas/ExploreDiscoverySurface';

describe('ExploreDiscoverySurface static preview', () => {
  it('renders the agreed example sections', () => {
    render(<ExploreDiscoverySurface />);
    for (const name of ['Curated schemas', 'Discover schemas', 'Schema picks']) {
      expect(screen.getByRole('heading', { name })).toBeVisible();
    }
    expect(screen.getByText('Plan and track software releases with confidence.')).toBeVisible();
  });
  it('submits a trimmed search to the catalog parent', () => {
    const onSearch = vi.fn();
    render(<ExploreDiscoverySurface onSearch={onSearch} />);
    const input = screen.getByRole('textbox', { name: 'Search projects and schemas' });
    fireEvent.change(input, { target: { value: '  release plan  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSearch).toHaveBeenCalledWith('release plan');
  });
  it('opens Browse through the parent callback', () => {
    const onBrowse = vi.fn();
    render(<ExploreDiscoverySurface onBrowse={onBrowse} />);
    fireEvent.click(screen.getByRole('button', { name: /Browse all/ }));
    expect(onBrowse).toHaveBeenCalledOnce();
  });
});
