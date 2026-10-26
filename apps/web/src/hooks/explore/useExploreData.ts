'use client';
import { useEffect, useRef, useState } from 'react';
import {
  fetchExploreRelease,
  fetchPublicProject,
  fetchPublicProjects,
  fetchSchemaTargets,
} from '@/infrastructure/explore';

/** Clear previous results immediately when the route changes; late responses cannot replace them. */
export function useExploreResource<T>(
  load: (key: string) => Promise<T>,
  key: string,
  enabled = true
) {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!enabled) return;
    setResult(undefined);
    void load(key).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (error: unknown) => {
        if (active)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Could not load this content.',
          });
      }
    );
    return () => {
      active = false;
    };
  }, [load, key, enabled, attempt]);
  const current = result?.key === key ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: enabled && !current,
    retry: () => setAttempt((value) => value + 1),
  };
}
export function useExplorePage<
  T extends { items: Array<{ projectId: string }>; next_cursor: string | null; has_more: boolean },
>(load: (query: string) => Promise<T>, query: string, enabled = true) {
  const first = useExploreResource(load, query, enabled);
  const [more, setMore] = useState<{ first: T; page: T; error?: string }>();
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    generation.current++;
    inFlight.current = false;
    setPending(false);
    setMore(undefined);
  }, [query, enabled, first.data]);
  const current = more?.first === first.data ? more : undefined;
  const data = current?.page ?? first.data;
  async function loadMore() {
    if (!first.data || !data?.next_cursor || inFlight.current || !enabled) return;
    const epoch = generation.current;
    inFlight.current = true;
    setPending(true);
    const params = new URLSearchParams(query);
    params.set('cursor', data.next_cursor);
    try {
      const page = await load(params.toString());
      if (epoch !== generation.current) return;
      const items = [
        ...new Map([...data.items, ...page.items].map((item) => [item.projectId, item])).values(),
      ];
      setMore({ first: first.data, page: { ...page, items } });
    } catch (error) {
      if (epoch === generation.current)
        setMore({
          first: first.data,
          page: data,
          error: error instanceof Error ? error.message : 'Could not load more.',
        });
    } finally {
      if (epoch === generation.current) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }
  return { ...first, data, error: current?.error ?? first.error, morePending: pending, loadMore };
}

export function usePublicProjects(query: string, enabled = true) {
  return useExplorePage(fetchPublicProjects, query, enabled);
}
export function useSchemaTargets(query: string) {
  return useExplorePage(fetchSchemaTargets, query);
}
export function usePublicProject(projectId: string) {
  return useExploreResource(fetchPublicProject, projectId);
}
export function useExploreRelease(query: string, enabled = true) {
  return useExploreResource(fetchExploreRelease, query, enabled);
}
