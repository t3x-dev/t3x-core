import { beforeEach, describe, expect, it } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('sessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and restore last active session', async () => {
    const { useSessionStore } = await import('@/store/sessionStore');
    const store = useSessionStore.getState();

    store.setLastSession('proj_123', 'conv_456');

    expect(localStorage.getItem('t3x-session-project')).toBe('proj_123');
    expect(localStorage.getItem('t3x-session-conversation')).toBe('conv_456');
  });

  it('should return null when no session stored', async () => {
    const { useSessionStore } = await import('@/store/sessionStore');
    const store = useSessionStore.getState();
    const session = store.getLastSession();

    expect(session.projectId).toBeNull();
    expect(session.conversationId).toBeNull();
  });

  it('should clear session', async () => {
    const { useSessionStore } = await import('@/store/sessionStore');
    const store = useSessionStore.getState();

    store.setLastSession('proj_123', 'conv_456');
    store.clearSession();

    expect(localStorage.getItem('t3x-session-project')).toBeNull();
  });
});
