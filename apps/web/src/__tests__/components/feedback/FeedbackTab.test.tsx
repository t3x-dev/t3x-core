// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FeedbackTab } from '@/components/feedback/FeedbackTab';

const mocks = vi.hoisted(() => ({
  loadProjects: vi.fn(),
  loadStats: vi.fn(),
  loadBuckets: vi.fn(),
}));
vi.mock('@/hooks/projects/useProjectsList', () => ({
  useProjectsList: () => ({ loadProjects: mocks.loadProjects }),
}));
vi.mock('@/hooks/feedback/useFeedbackStats', () => ({
  useFeedbackStats: () => ({ loadStats: mocks.loadStats, loadCosineBuckets: mocks.loadBuckets }),
}));
vi.mock('@/hooks/projects/useLeavesByProject', () => ({
  useLeavesByProject: () => ({ loadLeaves: vi.fn().mockResolvedValue([]) }),
}));
vi.mock('@/components/feedback/FeedbackOverview', () => ({
  FeedbackOverview: () => <div>Live overview</div>,
}));
vi.mock('@/components/feedback/FeedbackByTypeTable', () => ({
  FeedbackByTypeTable: () => <div>Live by type</div>,
}));

describe('FeedbackTab', () => {
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });
  it('renders available stats without requesting the missing cosine buckets endpoint', async () => {
    mocks.loadProjects.mockResolvedValue({ projects: [{ project_id: 'p', name: 'Project' }] });
    mocks.loadStats.mockResolvedValue({ overall: {}, by_inference_type: {} });
    render(<FeedbackTab />);

    await waitFor(() => expect(mocks.loadProjects).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Project' }));
    await waitFor(() => expect(mocks.loadStats).toHaveBeenCalledWith('p'));
    expect(screen.getByText('Live overview')).toBeInTheDocument();
    expect(mocks.loadBuckets).not.toHaveBeenCalled();
  });
});
