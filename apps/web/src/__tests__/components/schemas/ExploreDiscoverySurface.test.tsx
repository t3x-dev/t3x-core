// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExploreDiscoverySurface } from '@/components/schemas/ExploreDiscoverySurface';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('Discover reference surface', () => {
  it('sends search to Browse and preserves keyboard input while editing', () => {
    const search = vi.fn();
    render(<ExploreDiscoverySurface onSearch={search} />);
    const input = screen.getByRole('searchbox', { name: 'Search projects and schemas' });
    fireEvent.keyDown(document, { key: '/' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '  service/contract  ' } });
    fireEvent.keyDown(input, { key: '/' });
    fireEvent.submit(input.closest('form')!);
    expect(search).toHaveBeenCalledWith('service/contract');
  });

  it('routes browsing and authoring actions without claiming a schema was adopted', () => {
    const browse = vi.fn();
    const studio = vi.fn();
    render(<ExploreDiscoverySurface onBrowse={browse} onStudio={studio} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse', exact: true }));
    expect(browse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Studio', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'New schema' }));
    expect(studio).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Curated schemas' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Updates for you' })).toBeVisible();
  });
});
