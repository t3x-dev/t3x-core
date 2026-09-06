'use client';
import type { SchemaCatalogPage, SchemaReleasePresentationReference } from '@t3x-dev/api-client';
import { useEffect, useRef, useState } from 'react';
import {
  fetchSchemaCatalog,
  fetchSchemaCollections,
  fetchSchemaIntroduction,
  fetchSchemaReleaseReading,
} from '@/infrastructure/schemaCatalog';
import { fetchAuthoringTarget } from '@/infrastructure/stateAuthoring';

export function useSchemaCatalog(projectId: string, query: string, enabled = true) {
  const key = `${projectId}:${query}`;
  const [result, setResult] = useState<{ key: string; data?: SchemaCatalogPage; error?: string }>();
  const [retry, setRetry] = useState(0);
  const [morePending, setMorePending] = useState(false);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const current = ++epoch.current;
    inFlight.current = false;
    setMorePending(false);
    setResult(undefined);
    if (!enabled) return;
    fetchSchemaCatalog(projectId, query)
      .then((data) => {
        if (epoch.current === current) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (epoch.current === current)
          setResult({ key, error: error instanceof Error ? error.message : 'Catalog unavailable' });
      });
    return () => {
      ++epoch.current;
    };
  }, [projectId, query, key, enabled, retry]);
  const current = result?.key === key ? result : undefined;
  async function loadMore() {
    if (!current?.data?.next_cursor || inFlight.current || !enabled) return;
    inFlight.current = true;
    setMorePending(true);
    const requestEpoch = epoch.current;
    const params = new URLSearchParams(query);
    params.set('cursor', current.data.next_cursor);
    try {
      const page = await fetchSchemaCatalog(projectId, params.toString());
      if (epoch.current !== requestEpoch) return;
      setResult((previous) => {
        if (previous?.key !== key || !previous.data) return previous;
        const byId = new Map(
          [...previous.data.items, ...page.items].map((item) => [
            item.release.artifactVersionId,
            item,
          ])
        );
        return { key, data: { ...page, items: [...byId.values()] } };
      });
    } catch (error) {
      if (epoch.current === requestEpoch)
        setResult((previous) =>
          previous?.key === key
            ? {
                ...previous,
                error: error instanceof Error ? error.message : 'Could not load more releases',
              }
            : previous
        );
    } finally {
      if (epoch.current === requestEpoch) {
        inFlight.current = false;
        setMorePending(false);
      }
    }
  }
  return {
    data: current?.data,
    error: current?.error,
    loading: enabled && !current,
    morePending,
    loadMore,
    retry: () => setRetry((value) => value + 1),
  };
}
export function useSchemaCollections() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof fetchSchemaCollections>>>([]);
  useEffect(() => {
    let cancelled = false;
    fetchSchemaCollections()
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        /* Browse remains available without editorial collections. */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}
export function useSchemaIntroduction(reference?: SchemaReleasePresentationReference | null) {
  const projectId = reference?.projectId;
  const commitDigest = reference?.commitDigest;
  const presentationDigest = reference?.presentationDigest;
  const key = `${projectId}:${commitDigest}:${presentationDigest}`;
  const [result, setResult] = useState<{
    key: string;
    data?: Awaited<ReturnType<typeof fetchSchemaIntroduction>>;
    error?: string;
  }>();
  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    if (!projectId || !commitDigest || !presentationDigest) return;
    fetchSchemaIntroduction({ projectId, commitDigest, presentationDigest })
      .then((data) => {
        if (!cancelled) setResult({ key, data });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Introduction unavailable',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, commitDigest, presentationDigest, key]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: !!reference && !current };
}
export function usePublishIntroduction(projectId: string | undefined, enabled: boolean) {
  const key = `${projectId}:${enabled}`;
  const [result, setResult] = useState<{
    key: string;
    data?: Awaited<ReturnType<typeof fetchSchemaIntroduction>>;
    reference?: SchemaReleasePresentationReference;
    error?: string;
  }>();
  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    if (!enabled || !projectId) return;
    (async () => {
      const target = await fetchAuthoringTarget(projectId, 'main');
      if (!target.head || !target.canEdit) return { key };
      const data = await fetchSchemaIntroduction({ projectId, commitDigest: target.head });
      return {
        key,
        data,
        reference: data
          ? { projectId, commitDigest: target.head, presentationDigest: data.digest }
          : undefined,
      };
    })()
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Introduction unavailable',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, enabled, key]);
  return result?.key === key ? result : undefined;
}

export function useSchemaReleaseReading(
  projectId: string,
  source: { canonicalName: string; version: string; hash: string; sourceProjectId?: string },
  enabled: boolean
) {
  const key = JSON.stringify([
    projectId,
    source.canonicalName,
    source.version,
    source.hash,
    enabled,
    source.sourceProjectId,
  ]);
  const [result, setResult] = useState<{
    key: string;
    data?: Record<string, unknown>;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    const [project, name, version, hash, shouldLoad, sourceProject] = JSON.parse(key) as [
      string,
      string,
      string,
      string,
      boolean,
      string | undefined,
    ];
    if (!shouldLoad) return;
    void fetchSchemaReleaseReading(project, name, version, hash, sourceProject).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (error: unknown) => {
        if (active)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Release reading unavailable',
          });
      }
    );
    return () => {
      active = false;
    };
  }, [key]);
  const current = result?.key === key ? result : undefined;
  return { data: current?.data, error: current?.error, loading: enabled && !current };
}
