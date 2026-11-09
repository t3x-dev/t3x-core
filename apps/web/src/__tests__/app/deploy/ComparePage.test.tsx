// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ComparePage from '@/app/deploy/compare/page';
import type { ConfigurationStats } from '@/infrastructure';

const mock = vi.hoisted(() => ({
  configs: vi.fn(),
  history: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => mock.params,
  useRouter: () => ({ push: mock.push }),
}));
vi.mock('@/hooks/projects/useProjects', () => ({
  useProjects: () => ({
    projects: [
      { project_id: 'alpha', name: 'Alpha' },
      { project_id: 'beta', name: 'Beta' },
    ],
    loading: false,
    error: null,
  }),
}));
vi.mock('@/infrastructure', () => ({
  getConfigurations: mock.configs,
  listSavedComparisons: mock.history,
}));

const config = {
  model: 'runner-model',
  prompt_version: 'v1',
  run_count: 1,
} as ConfigurationStats;

describe('Compare project scope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.params = new URLSearchParams();
    mock.history.mockResolvedValue([]);
  });

  it('waits for explicit project selection before requesting comparison data', () => {
    render(<ComparePage />);
    expect(mock.configs).not.toHaveBeenCalled();
    expect(mock.history).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'beta' } });
    expect(mock.push).toHaveBeenCalledWith('/deploy/compare?project=beta');
  });

  it('ignores a previous project response and keeps preparation in the selected project', async () => {
    let resolveAlpha!: (configs: ConfigurationStats[]) => void;
    mock.configs.mockImplementation((project: string) =>
      project === 'alpha'
        ? new Promise<ConfigurationStats[]>((resolve) => {
            resolveAlpha = resolve;
          })
        : Promise.resolve([config])
    );
    mock.params = new URLSearchParams('project=alpha');
    const { rerender } = render(<ComparePage />);
    await waitFor(() => expect(mock.configs).toHaveBeenCalledWith('alpha'));
    mock.params = new URLSearchParams('project=beta');
    rerender(<ComparePage />);
    expect(await screen.findByText('One configuration available')).toBeInTheDocument();
    await act(async () => resolveAlpha([]));

    expect(screen.queryByText('No comparable runs yet')).not.toBeInTheDocument();
    expect(mock.history).toHaveBeenLastCalledWith('beta');
    expect(screen.getByRole('link', { name: 'Prepare comparison data' })).toHaveAttribute(
      'href',
      '/deploy?project=beta&prepare=1#comparison-preparation'
    );
  });

  it('distinguishes unavailable configurations from a confirmed empty list', async () => {
    mock.params = new URLSearchParams('project=beta');
    mock.configs.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue([]);
    render(<ComparePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load configurations');
    expect(screen.queryByRole('link', { name: 'Prepare comparison data' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No comparable runs yet')).toBeInTheDocument();
  });
});
