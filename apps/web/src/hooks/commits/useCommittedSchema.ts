import {
  type WorkspaceSchemaDefinitionSnapshot,
  WorkspaceSchemaDefinitionSnapshotSchema,
} from '@t3x-dev/api-client';
import { useEffect, useState } from 'react';
import { getCommitChanges } from '@/infrastructure/commits';

export interface CommittedSchemaState {
  snapshot?: WorkspaceSchemaDefinitionSnapshot | null;
  loading: boolean;
  error?: string;
  retry: () => void;
}

/** Optional explanation from immutable Commit evidence, never the live Workspace draft. */
export function useCommittedSchema(projectId: string, digest: string | null): CommittedSchemaState {
  const scope = JSON.stringify([projectId, digest]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    scope: string;
    snapshot?: WorkspaceSchemaDefinitionSnapshot | null;
    error?: string;
  }>();
  useEffect(() => {
    if (!digest) return;
    const abort = new AbortController();
    setResult(undefined);
    void getCommitChanges(projectId, digest, undefined, abort.signal)
      .then((data) => {
        if (abort.signal.aborted) return;
        if (data.projectId !== projectId || data.commitDigest !== digest)
          throw new Error('Schema does not match this version.');
        const snapshot = data.schemaReview
          ? WorkspaceSchemaDefinitionSnapshotSchema.parse(data.schemaReview.draft)
          : null;
        setResult({ scope, snapshot });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setResult({
            scope,
            error: error instanceof Error ? error.message : 'Schema details unavailable.',
          });
      });
    return () => abort.abort();
  }, [projectId, digest, scope, attempt]);
  const current = result?.scope === scope ? result : undefined;
  return {
    snapshot: current?.snapshot,
    error: current?.error,
    loading: Boolean(digest) && !current,
    retry: () => setAttempt((value) => value + 1),
  };
}
