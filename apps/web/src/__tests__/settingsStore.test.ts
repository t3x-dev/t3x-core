// @vitest-environment jsdom
/**
 * Tests for settingsStore (developer mode toggle + persistence)
 *
 * Node.js 25+ ships a native `localStorage` global that is a broken stub
 * (setItem is undefined) unless `--localstorage-file` is given a valid path.
 * vitest's jsdom environment fails to override it, so we polyfill it here
 * before the Zustand persist middleware captures a reference to it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  if (
    typeof globalThis.localStorage !== 'object' ||
    typeof globalThis.localStorage.setItem === 'function'
  ) {
    return; // localStorage already works, no polyfill needed
  }
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    },
  });
});

import {
  DEFAULT_LOCAL_WORKSPACE_NAME,
  resolveLocalWorkspaceName,
  useSettingsStore,
} from '@/store/settingsStore';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset store to initial state between tests
  useSettingsStore.setState({
    developerMode: false,
    userExperience: 'general',
    defaultView: 'timeline',
    density: 'comfortable',
    localWorkspaceName: 'Local user',
    localWorkspaceAvatarColor: 'blue',
  });
  localStorage.removeItem('t3x-settings');
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('settingsStore', () => {
  it('has developerMode = false by default', () => {
    const state = useSettingsStore.getState();
    expect(state.developerMode).toBe(false);
    expect(state.localWorkspaceName).toBe('Local user');
    expect(state.localWorkspaceAvatarColor).toBe('blue');
  });

  it('toggleDeveloperMode toggles from false to true', () => {
    useSettingsStore.getState().toggleDeveloperMode();
    expect(useSettingsStore.getState().developerMode).toBe(true);
  });

  it('toggleDeveloperMode toggles from true to false', () => {
    useSettingsStore.getState().setDeveloperMode(true);
    expect(useSettingsStore.getState().developerMode).toBe(true);

    useSettingsStore.getState().toggleDeveloperMode();
    expect(useSettingsStore.getState().developerMode).toBe(false);
  });

  it('setDeveloperMode sets the value directly', () => {
    useSettingsStore.getState().setDeveloperMode(true);
    expect(useSettingsStore.getState().developerMode).toBe(true);

    useSettingsStore.getState().setDeveloperMode(false);
    expect(useSettingsStore.getState().developerMode).toBe(false);
  });

  it('multiple toggles cycle correctly', () => {
    const store = useSettingsStore.getState();

    store.toggleDeveloperMode(); // false -> true
    expect(useSettingsStore.getState().developerMode).toBe(true);

    useSettingsStore.getState().toggleDeveloperMode(); // true -> false
    expect(useSettingsStore.getState().developerMode).toBe(false);

    useSettingsStore.getState().toggleDeveloperMode(); // false -> true
    expect(useSettingsStore.getState().developerMode).toBe(true);

    useSettingsStore.getState().toggleDeveloperMode(); // true -> false
    expect(useSettingsStore.getState().developerMode).toBe(false);
  });

  it('persists state to localStorage via zustand persist', () => {
    // Toggle developer mode
    useSettingsStore.getState().setDeveloperMode(true);

    // Zustand persist writes to localStorage under 't3x-settings'
    const raw = localStorage.getItem('t3x-settings');
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw!);
    expect(persisted.state.developerMode).toBe(true);
  });

  it('partialize only persists developerMode (not functions)', () => {
    useSettingsStore.getState().setDeveloperMode(true);
    useSettingsStore.getState().setLocalWorkspaceName('Meaning Studio');
    useSettingsStore.getState().setLocalWorkspaceAvatarColor('violet');

    const raw = localStorage.getItem('t3x-settings');
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw!);
    const stateKeys = Object.keys(persisted.state);
    expect(stateKeys).toContain('developerMode');
    expect(stateKeys).toContain('localWorkspaceName');
    expect(stateKeys).toContain('localWorkspaceAvatarColor');
    // Functions should not be serialized by partialize
    expect(stateKeys).not.toContain('setDeveloperMode');
    expect(stateKeys).not.toContain('toggleDeveloperMode');
    expect(stateKeys).not.toContain('setLocalWorkspaceName');
    expect(stateKeys).not.toContain('setLocalWorkspaceAvatarColor');
  });

  it('persists local workspace profile customizations', () => {
    useSettingsStore.getState().setLocalWorkspaceName('Meaning Studio');
    useSettingsStore.getState().setLocalWorkspaceAvatarColor('teal');

    const raw = localStorage.getItem('t3x-settings');
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw!);
    expect(persisted.state.localWorkspaceName).toBe('Meaning Studio');
    expect(persisted.state.localWorkspaceAvatarColor).toBe('teal');
  });

  it('resolves blank local workspace names to the default author', () => {
    expect(resolveLocalWorkspaceName('')).toBe(DEFAULT_LOCAL_WORKSPACE_NAME);
    expect(resolveLocalWorkspaceName('   ')).toBe(DEFAULT_LOCAL_WORKSPACE_NAME);
    expect(resolveLocalWorkspaceName('Local Workspace')).toBe(DEFAULT_LOCAL_WORKSPACE_NAME);
    expect(resolveLocalWorkspaceName('  Local Tester  ')).toBe('Local Tester');
  });

  it('restores persisted state from localStorage', () => {
    // Pre-seed localStorage with persisted data
    localStorage.setItem(
      't3x-settings',
      JSON.stringify({ state: { developerMode: true }, version: 0 })
    );

    // Trigger rehydration by calling persist's rehydrate
    useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().developerMode).toBe(true);
  });
});
