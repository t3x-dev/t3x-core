// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectVisibilitySettings } from '@/components/project/ProjectVisibilitySettings';

const mocks = vi.hoisted(() => ({
  changeProjectVisibility: vi.fn(),
  fetchProject: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/commands/projects/changeProjectVisibility', () => ({
  changeProjectVisibility: mocks.changeProjectVisibility,
}));

vi.mock('@/queries/projects', () => ({
  fetchProject: mocks.fetchProject,
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess },
}));

const privateProject = {
  project_id: 'project-1',
  name: 'Private project',
  visibility: 'private' as const,
  created_at: '2026-09-02T00:00:00.000Z',
};

describe('ProjectVisibilitySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProject.mockResolvedValue(privateProject);
  });

  it('loads the canonical visibility and leaves an unchanged command disabled', async () => {
    render(<ProjectVisibilitySettings projectId="project-1" />);

    expect(await screen.findByRole('combobox', { name: 'Project visibility' })).toHaveValue(
      'private'
    );
    expect(screen.getByRole('button', { name: 'Save visibility' })).toBeDisabled();
    expect(screen.getByText(/Public discovery and managed-AI grants are separate/)).toBeVisible();
  });

  it('requires explicit publication confirmation and sends compare-and-set input', async () => {
    mocks.changeProjectVisibility.mockResolvedValue({
      project: { ...privateProject, visibility: 'public' },
      changed: true,
      evidence_id: 'visibility-event-1',
    });
    render(<ProjectVisibilitySettings projectId="project-1" />);

    const select = await screen.findByRole('combobox', { name: 'Project visibility' });
    fireEvent.change(select, { target: { value: 'public' } });
    const save = screen.getByRole('button', { name: 'Save visibility' });
    expect(save).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(/I understand this publishes the project and records immutable/)
    );
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.changeProjectVisibility).toHaveBeenCalledWith('project-1', {
        expected_visibility: 'private',
        visibility: 'public',
        confirm_publication: true,
      })
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Project visibility updated');
    expect(select).toHaveValue('public');
  });

  it('renders a useful hosted capacity denial without copying plan numbers', async () => {
    mocks.changeProjectVisibility.mockRejectedValue(
      Object.assign(new Error('Private-project capacity is exhausted (3/3)'), {
        code: 'PRIVATE_PROJECT_CAPACITY_EXHAUSTED',
      })
    );
    mocks.fetchProject.mockResolvedValue({ ...privateProject, visibility: 'public' });
    render(<ProjectVisibilitySettings projectId="project-1" />);

    fireEvent.change(await screen.findByRole('combobox', { name: 'Project visibility' }), {
      target: { value: 'private' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This workspace has reached its private and unlisted project capacity.'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('3/3');
  });

  it('refreshes after a compare-and-set conflict', async () => {
    mocks.changeProjectVisibility.mockRejectedValue(
      Object.assign(new Error('Project visibility changed; refresh and retry'), {
        code: 'CONFLICT',
      })
    );
    mocks.fetchProject
      .mockResolvedValueOnce(privateProject)
      .mockResolvedValueOnce({ ...privateProject, visibility: 'unlisted' });
    render(<ProjectVisibilitySettings projectId="project-1" />);

    fireEvent.change(await screen.findByRole('combobox', { name: 'Project visibility' }), {
      target: { value: 'unlisted' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Project visibility changed elsewhere. The current value has been refreshed.'
    );
    expect(screen.getByRole('combobox', { name: 'Project visibility' })).toHaveValue('unlisted');
    expect(mocks.fetchProject).toHaveBeenCalledTimes(2);
  });
});
