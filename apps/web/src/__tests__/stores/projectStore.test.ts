/**
 * Project Store Tests
 *
 * Tests for the Zustand project store that manages project CRUD operations.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/projectStore';

// projectStore now routes through @/queries/projects (doc-aligned L3).
vi.mock('@/queries/projects', () => ({
  fetchProjects: vi.fn(),
  createProjectApi: vi.fn(),
  deleteProjectById: vi.fn(),
  updateProjectById: vi.fn(),
}));

import * as api from '@/queries/projects';

// Helper to reset store between tests
const resetStore = () => {
  useProjectStore.setState({
    projects: [],
    loading: false,
    error: null,
    initialized: false,
    notifyCallback: null,
  });
};

describe('Project Store', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('has empty projects array initially', () => {
      const state = useProjectStore.getState();
      expect(state.projects).toEqual([]);
    });

    it('is not loading initially', () => {
      const state = useProjectStore.getState();
      expect(state.loading).toBe(false);
    });

    it('has no error initially', () => {
      const state = useProjectStore.getState();
      expect(state.error).toBeNull();
    });

    it('is not initialized initially', () => {
      const state = useProjectStore.getState();
      expect(state.initialized).toBe(false);
    });
  });

  describe('setNotifyCallback', () => {
    it('sets the notification callback', () => {
      const callback = vi.fn();
      useProjectStore.getState().setNotifyCallback(callback);

      expect(useProjectStore.getState().notifyCallback).toBe(callback);
    });

    it('can clear the notification callback', () => {
      const callback = vi.fn();
      useProjectStore.getState().setNotifyCallback(callback);
      useProjectStore.getState().setNotifyCallback(null);

      expect(useProjectStore.getState().notifyCallback).toBeNull();
    });
  });

  describe('fetchProjects', () => {
    it('fetches projects from API', async () => {
      const mockProjects = {
        projects: [
          {
            project_id: 'proj_123',
            name: 'Test Project',
            metadata: { description: 'Test description' },
            created_at: new Date().toISOString(),
            turns_count: 5,
            conversations_count: 2,
          },
        ],
        limit: 100,
        offset: 0,
      };

      vi.mocked(api.fetchProjects).mockResolvedValueOnce(mockProjects);

      await useProjectStore.getState().fetchProjects();

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe('proj_123');
      expect(state.projects[0].name).toBe('Test Project');
      expect(state.initialized).toBe(true);
      expect(state.loading).toBe(false);
    });

    it('sets loading state during fetch', async () => {
      vi.mocked(api.fetchProjects).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ projects: [], limit: 100, offset: 0 }), 100)
          )
      );

      const fetchPromise = useProjectStore.getState().fetchProjects();

      // Check loading state immediately
      expect(useProjectStore.getState().loading).toBe(true);

      await fetchPromise;

      expect(useProjectStore.getState().loading).toBe(false);
    });

    it('handles API errors', async () => {
      const error = new Error('Network error');
      vi.mocked(api.fetchProjects).mockRejectedValueOnce(error);

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      await useProjectStore.getState().fetchProjects();

      const state = useProjectStore.getState();
      expect(state.error).toEqual(error);
      expect(state.loading).toBe(false);
      expect(state.initialized).toBe(true);
      expect(notifyCallback).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load projects'),
        'error'
      );
    });

    it('skips fetch if already loading', async () => {
      useProjectStore.setState({ loading: true });

      await useProjectStore.getState().fetchProjects();

      expect(api.fetchProjects).not.toHaveBeenCalled();
    });
  });

  describe('addProject', () => {
    it('creates project via API', async () => {
      const mockProject = {
        project_id: 'proj_new',
        name: 'New Project',
        metadata: { description: 'Fresh project awaiting conversations.' },
        created_at: new Date().toISOString(),
        turns_count: 0,
        conversations_count: 0,
      };

      vi.mocked(api.createProjectApi).mockResolvedValueOnce(mockProject);

      const result = await useProjectStore.getState().addProject('New Project');

      expect(result.id).toBe('proj_new');
      expect(result.name).toBe('New Project');
      expect(useProjectStore.getState().projects).toHaveLength(1);
    });

    it('notifies on successful creation', async () => {
      const mockProject = {
        project_id: 'proj_new',
        name: 'Test',
        metadata: {},
        created_at: new Date().toISOString(),
        turns_count: 0,
        conversations_count: 0,
      };

      vi.mocked(api.createProjectApi).mockResolvedValueOnce(mockProject);

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      await useProjectStore.getState().addProject('Test');

      expect(notifyCallback).toHaveBeenCalledWith(
        expect.stringContaining('Created project'),
        'success'
      );
    });

    it('trims whitespace from project name', async () => {
      const mockProject = {
        project_id: 'proj_123',
        name: 'Trimmed Name',
        metadata: {},
        created_at: new Date().toISOString(),
        turns_count: 0,
        conversations_count: 0,
      };

      vi.mocked(api.createProjectApi).mockResolvedValueOnce(mockProject);

      await useProjectStore.getState().addProject('  Trimmed Name  ');

      expect(api.createProjectApi).toHaveBeenCalledWith('Trimmed Name', expect.any(Object));
    });

    it('uses default name if empty', async () => {
      const mockProject = {
        project_id: 'proj_123',
        name: 'Untitled Project',
        metadata: {},
        created_at: new Date().toISOString(),
        turns_count: 0,
        conversations_count: 0,
      };

      vi.mocked(api.createProjectApi).mockResolvedValueOnce(mockProject);

      await useProjectStore.getState().addProject('   ');

      expect(api.createProjectApi).toHaveBeenCalledWith('Untitled Project', expect.any(Object));
    });

    it('creates offline project when API fails', async () => {
      // addProject only falls back to an offline project on TypeError (network failure).
      // Generic Error instances are re-thrown so the UI can display them. Simulate a
      // network-level failure with TypeError (the error fetch() itself throws).
      vi.mocked(api.createProjectApi).mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      const result = await useProjectStore.getState().addProject('Offline Project');

      expect(result.id).toMatch(/^local-/);
      expect(result.name).toContain('offline');
      expect(result.status).toBe('draft');
      expect(notifyCallback).toHaveBeenCalledWith(expect.stringContaining('offline'), 'warning');
    });
  });

  describe('deleteProject', () => {
    beforeEach(() => {
      // Set up initial projects
      useProjectStore.setState({
        projects: [
          {
            id: 'proj_123',
            name: 'Test Project',
            description: 'Test',
            updatedAt: 'just now',
            owner: 'You',
            status: 'active',
            nodes: 0,
            drafts: 0,
            commitsCount: 0,
            branchesCount: 0,
          },
        ],
      });
    });

    it('removes project from state and calls API', async () => {
      vi.mocked(api.deleteProjectById).mockResolvedValueOnce({ deleted: true, project_id: 'proj_123' });

      await useProjectStore.getState().deleteProject('proj_123');

      expect(useProjectStore.getState().projects).toHaveLength(0);
      expect(api.deleteProjectById).toHaveBeenCalledWith('proj_123');
    });

    it('notifies on successful deletion', async () => {
      vi.mocked(api.deleteProjectById).mockResolvedValueOnce({ deleted: true, project_id: 'proj_123' });

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      await useProjectStore.getState().deleteProject('proj_123');

      expect(notifyCallback).toHaveBeenCalledWith(expect.stringContaining('Deleted'), 'success');
    });

    it('restores project on API failure', async () => {
      vi.mocked(api.deleteProjectById).mockRejectedValueOnce(new Error('Server error'));

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      await useProjectStore.getState().deleteProject('proj_123');

      // Project should be restored
      expect(useProjectStore.getState().projects).toHaveLength(1);
      expect(notifyCallback).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete'),
        'error'
      );
    });

    it('handles 404 with warning notification', async () => {
      vi.mocked(api.deleteProjectById).mockRejectedValueOnce(new Error('404 not found'));

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      await useProjectStore.getState().deleteProject('proj_123');

      // Project is NOT restored on 404 — it was already deleted server-side
      expect(useProjectStore.getState().projects).toHaveLength(0);
      expect(notifyCallback).toHaveBeenCalledWith(
        expect.stringContaining('already deleted'),
        'warning'
      );
    });

    it('skips API call for local projects', async () => {
      useProjectStore.setState({
        projects: [
          {
            id: 'local-123456',
            name: 'Local Project',
            description: 'Test',
            updatedAt: 'just now',
            owner: 'You',
            status: 'draft',
            nodes: 0,
            drafts: 0,
            commitsCount: 0,
            branchesCount: 0,
          },
        ],
      });

      await useProjectStore.getState().deleteProject('local-123456');

      expect(api.deleteProjectById).not.toHaveBeenCalled();
      expect(useProjectStore.getState().projects).toHaveLength(0);
    });
  });

  describe('getProject', () => {
    beforeEach(() => {
      useProjectStore.setState({
        projects: [
          {
            id: 'proj_123',
            name: 'Test Project',
            description: 'Test',
            updatedAt: 'just now',
            owner: 'You',
            status: 'active',
            nodes: 5,
            drafts: 2,
            commitsCount: 0,
            branchesCount: 0,
          },
        ],
      });
    });

    it('returns project by ID', () => {
      const project = useProjectStore.getState().getProject('proj_123');

      expect(project).toBeDefined();
      expect(project?.name).toBe('Test Project');
    });

    it('returns undefined for non-existent project', () => {
      const project = useProjectStore.getState().getProject('proj_nonexistent');

      expect(project).toBeUndefined();
    });
  });
});
