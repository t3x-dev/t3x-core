/**
 * Project Store Tests
 *
 * Tests for the Zustand project store that manages project CRUD operations.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useProjectStore } from '@/store/projectStore';

// Mock the API module
vi.mock('@/lib/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  deleteProject: vi.fn(),
}));

import * as api from '@/lib/api';

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
        total: 1,
      };

      vi.mocked(api.listProjects).mockResolvedValueOnce(mockProjects);

      await useProjectStore.getState().fetchProjects();

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe('proj_123');
      expect(state.projects[0].name).toBe('Test Project');
      expect(state.initialized).toBe(true);
      expect(state.loading).toBe(false);
    });

    it('sets loading state during fetch', async () => {
      vi.mocked(api.listProjects).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ projects: [], total: 0 }), 100))
      );

      const fetchPromise = useProjectStore.getState().fetchProjects();

      // Check loading state immediately
      expect(useProjectStore.getState().loading).toBe(true);

      await fetchPromise;

      expect(useProjectStore.getState().loading).toBe(false);
    });

    it('handles API errors', async () => {
      const error = new Error('Network error');
      vi.mocked(api.listProjects).mockRejectedValueOnce(error);

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

      expect(api.listProjects).not.toHaveBeenCalled();
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

      vi.mocked(api.createProject).mockResolvedValueOnce(mockProject);

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

      vi.mocked(api.createProject).mockResolvedValueOnce(mockProject);

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

      vi.mocked(api.createProject).mockResolvedValueOnce(mockProject);

      await useProjectStore.getState().addProject('  Trimmed Name  ');

      expect(api.createProject).toHaveBeenCalledWith('Trimmed Name', expect.any(Object));
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

      vi.mocked(api.createProject).mockResolvedValueOnce(mockProject);

      await useProjectStore.getState().addProject('   ');

      expect(api.createProject).toHaveBeenCalledWith('Untitled Project', expect.any(Object));
    });

    it('creates offline project when API fails', async () => {
      vi.mocked(api.createProject).mockRejectedValueOnce(new Error('API unavailable'));

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      const result = await useProjectStore.getState().addProject('Offline Project');

      expect(result.id).toMatch(/^local-/);
      expect(result.name).toContain('offline');
      expect(result.status).toBe('draft');
      expect(notifyCallback).toHaveBeenCalledWith(
        expect.stringContaining('offline'),
        'warning'
      );
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
          },
        ],
      });
    });

    it('removes project from state and calls API', async () => {
      vi.mocked(api.deleteProject).mockResolvedValueOnce(undefined);

      await useProjectStore.getState().deleteProject('proj_123');

      expect(useProjectStore.getState().projects).toHaveLength(0);
      expect(api.deleteProject).toHaveBeenCalledWith('proj_123');
    });

    it('notifies on successful deletion', async () => {
      vi.mocked(api.deleteProject).mockResolvedValueOnce(undefined);

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      await useProjectStore.getState().deleteProject('proj_123');

      expect(notifyCallback).toHaveBeenCalledWith(
        expect.stringContaining('Deleted'),
        'success'
      );
    });

    it('restores project on API failure', async () => {
      vi.mocked(api.deleteProject).mockRejectedValueOnce(new Error('Server error'));

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
      vi.mocked(api.deleteProject).mockRejectedValueOnce(new Error('404 not found'));

      const notifyCallback = vi.fn();
      useProjectStore.getState().setNotifyCallback(notifyCallback);

      await useProjectStore.getState().deleteProject('proj_123');

      // Project is restored (current behavior - restore happens before 404 check)
      // The 404 check only changes the notification message
      expect(useProjectStore.getState().projects).toHaveLength(1);
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
          },
        ],
      });

      await useProjectStore.getState().deleteProject('local-123456');

      expect(api.deleteProject).not.toHaveBeenCalled();
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
