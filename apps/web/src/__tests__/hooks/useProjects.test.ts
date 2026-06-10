// @vitest-environment jsdom
/**
 * Tests for `useProjects` — specifically the `create` action wired by the
 * "+ New Project" button in ChatSidebar (Bug-3, deep-walk 2026-04-15).
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupRoots, renderHook, waitForHook } from './renderHook';

// Mock infrastructure (listProjects for initial load + deleteProject) and
// commands (createProject) before importing the hook.
vi.mock('@/infrastructure/projects', () => ({
  listProjects: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('@/commands/projects', () => ({
  createProject: vi.fn(),
}));

import { createProject as createProjectCommand } from '@/commands/projects';
import { useProjects } from '@/hooks/projects/useProjects';
import { listProjects } from '@/infrastructure/projects';

beforeEach(() => {
  vi.clearAllMocks();
  (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue({ projects: [] });
});

afterEach(() => {
  cleanupRoots();
});

describe('useProjects.create', () => {
  it('keeps refresh failures in hook state instead of throwing to the page', async () => {
    const { result } = renderHook(() => useProjects());
    await waitForHook();

    (listProjects as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Failed to fetch'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.projects).toEqual([]);
    expect(result.current.error).toBe(
      'Network request failed. Check your connection and try again.'
    );
    expect(result.current.loading).toBe(false);
  });

  it('invokes the createProject command and returns the new project', async () => {
    const fake = {
      project_id: 'proj_test123',
      name: 'Untitled workspace',
      created_at: '2026-04-15T00:00:00Z',
    };
    (createProjectCommand as ReturnType<typeof vi.fn>).mockResolvedValue(fake);

    const { result } = renderHook(() => useProjects());
    await waitForHook(); // flush initial listProjects effect

    let created: unknown;
    await act(async () => {
      created = await result.current.create();
    });

    expect(createProjectCommand).toHaveBeenCalledWith('Untitled workspace');
    expect(created).toEqual(fake);
    expect(result.current.projects[0]).toEqual(fake);
  });

  it('trims whitespace and falls back to "Untitled workspace" when name is blank', async () => {
    const fake = {
      project_id: 'proj_blank',
      name: 'Untitled workspace',
      created_at: '2026-04-15T00:00:00Z',
    };
    (createProjectCommand as ReturnType<typeof vi.fn>).mockResolvedValue(fake);

    const { result } = renderHook(() => useProjects());
    await waitForHook();

    await act(async () => {
      await result.current.create('   ');
    });

    expect(createProjectCommand).toHaveBeenCalledWith('Untitled workspace');
  });

  it('propagates errors from the command layer', async () => {
    (createProjectCommand as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useProjects());
    await waitForHook();

    await expect(
      act(async () => {
        await result.current.create('X');
      })
    ).rejects.toThrow('boom');
  });
});
