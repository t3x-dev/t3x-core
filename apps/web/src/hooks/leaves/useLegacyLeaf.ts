'use client';
import { useEffect, useState } from 'react';
import { downloadAsFile } from '@/infrastructure/export/core';
import { getLeaf, type LegacyLeafHistory, listLegacyLeafHistory } from '@/infrastructure/leaves';
import type { Leaf } from '@/types/api';

export function useLegacyLeaf(projectId: string, leafId: string) {
  const [page, setPage] = useState(0);
  const key = `${projectId}:${leafId}:${page}`;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    leaf?: Leaf;
    history?: LegacyLeafHistory[];
    error?: string;
    historyError?: string;
  }>();
  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    void (async () => {
      try {
        const leaf = await getLeaf(leafId);
        if (leaf.project_id !== projectId) throw new Error('Leaf does not belong to this project.');
        if (cancelled) return;
        setResult({ key, leaf });
        try {
          const history = await listLegacyLeafHistory(leafId, page * 100);
          if (!cancelled) setResult({ key, leaf, history });
        } catch (error) {
          if (!cancelled) setResult({ key, leaf, historyError: String(error) });
        }
      } catch (error) {
        if (!cancelled)
          setResult({ key, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, leafId, key, retry, page]);
  return {
    ...(result?.key === key ? result : {}),
    page,
    setPage,
    retry: () => setRetry((n) => n + 1),
    download: (format: 'json' | 'text', record: Leaf | LegacyLeafHistory) => {
      if (result?.key !== key || !result.leaf) throw new Error('Leaf is not loaded.');
      const body =
        format === 'json'
          ? JSON.stringify(
              {
                project_id: projectId,
                leaf_id: leafId,
                commit_hash: result.leaf.commit_hash,
                record,
              },
              null,
              2
            )
          : (record.output ?? '');
      downloadAsFile(
        body,
        `legacy-${record.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.${format === 'json' ? 'json' : 'txt'}`,
        format === 'json' ? 'application/json' : 'text/plain'
      );
    },
  };
}
