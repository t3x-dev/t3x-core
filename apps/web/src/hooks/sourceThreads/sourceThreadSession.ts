import { type SetStateAction, useCallback, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

// Browser-memory ownership lets an in-flight request keep updating its session
// while its route is unmounted. Nothing here is persisted across a page reload.
export type SourceThreadSession = Map<string, StoreApi<{ value: unknown }>>;
const workspaceSessions = new Map<string, SourceThreadSession>();

export function useWorkspaceAssistantSession(projectId: string, workspaceId?: string) {
  return useMemo(() => {
    if (!workspaceId || typeof window === 'undefined') return undefined;
    const key = JSON.stringify([projectId, workspaceId]);
    let session = workspaceSessions.get(key);
    if (!session) {
      session = new Map();
      workspaceSessions.set(key, session);
    }
    return session;
  }, [projectId, workspaceId]);
}

export function sessionValue<T>(session: SourceThreadSession | undefined, key: string) {
  return session?.get(key)?.getState().value as T | undefined;
}

/** useState semantics, with setters that remain live after the view unmounts. */
export function useSourceThreadSessionState<T>(
  session: SourceThreadSession | undefined,
  key: string,
  initial: T | (() => T)
) {
  const initializer = useRef(initial);
  initializer.current = initial;
  const store = useMemo(() => {
    const existing = session?.get(key);
    if (existing) return existing;
    const value = initializer.current;
    const created = createStore<{ value: unknown }>(() => ({
      value: typeof value === 'function' ? (value as () => T)() : value,
    }));
    session?.set(key, created);
    return created;
  }, [session, key]);
  const value = useStore(store, (state) => state.value) as T;
  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      store.setState({
        value:
          typeof next === 'function'
            ? (next as (previous: T) => T)(store.getState().value as T)
            : next,
      });
    },
    [store]
  );
  return [value, setValue] as const;
}

export function useSourceThreadSessionRef<T>(
  session: SourceThreadSession | undefined,
  key: string,
  initial: T
) {
  return useSourceThreadSessionState(session, key, () => ({ current: initial }))[0];
}
