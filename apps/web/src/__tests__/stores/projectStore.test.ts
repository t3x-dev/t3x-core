/**
 * Project Store Tests (passive, v2 §2.5)
 *
 * Store is now pure state + setters + pure selectors. I/O moved to
 * hooks/useProjectOperations. Former tests for addProject / deleteProject /
 * fetchProjects store actions were removed when their I/O migrated;
 * addProject and deleteProject store methods were dead code (no callers)
 * and are deleted, not relocated.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '@/store/projectStore';

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

  describe('setters', () => {
    it('setProjects replaces the array', () => {
      const projects = [
        {
          id: 'proj_1',
          name: 'A',
          description: '',
          updatedAt: 'just now',
          owner: 'You',
          status: 'active' as const,
          nodes: 0,
          drafts: 0,
          commitsCount: 0,
          branchesCount: 0,
        },
      ];
      useProjectStore.getState().setProjects(projects);
      expect(useProjectStore.getState().projects).toEqual(projects);
    });

    it('patchProject merges fields for the matching id', () => {
      useProjectStore.getState().setProjects([
        {
          id: 'proj_1',
          name: 'A',
          description: '',
          updatedAt: 'just now',
          owner: 'You',
          status: 'draft',
          nodes: 0,
          drafts: 0,
          commitsCount: 0,
          branchesCount: 0,
          defaultProvider: null,
          defaultModel: null,
        },
      ]);
      useProjectStore
        .getState()
        .patchProject('proj_1', { defaultProvider: 'anthropic', defaultModel: 'sonnet' });
      expect(useProjectStore.getState().projects[0].defaultProvider).toBe('anthropic');
      expect(useProjectStore.getState().projects[0].defaultModel).toBe('sonnet');
      // unrelated fields untouched
      expect(useProjectStore.getState().projects[0].name).toBe('A');
    });

    it('setLoading / setError / setInitialized flip flags', () => {
      const err = new Error('x');
      useProjectStore.getState().setLoading(true);
      useProjectStore.getState().setError(err);
      useProjectStore.getState().setInitialized(true);
      const s = useProjectStore.getState();
      expect(s.loading).toBe(true);
      expect(s.error).toBe(err);
      expect(s.initialized).toBe(true);
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
