// @vitest-environment jsdom
/**
 * Tests for settingsStore (developer mode toggle + persistence)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '@/store/settingsStore';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset store to initial state between tests
  useSettingsStore.setState({ developerMode: false });
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

    const raw = localStorage.getItem('t3x-settings');
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw!);
    const stateKeys = Object.keys(persisted.state);
    expect(stateKeys).toContain('developerMode');
    // Functions should not be serialized by partialize
    expect(stateKeys).not.toContain('setDeveloperMode');
    expect(stateKeys).not.toContain('toggleDeveloperMode');
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
