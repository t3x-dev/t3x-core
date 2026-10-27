'use client';

import type { WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { canonicalJson, type YValue } from '@t3x-dev/yops';
import { useEffect, useState } from 'react';
import {
  loadProjectYSchemaVersions,
  loadYSchemaArtifactRegistry,
} from '@/infrastructure/schemaComposition';
import {
  listStudioCandidates,
  previewStudioSelection,
  readStudioSchemaEditCandidate,
} from '@/infrastructure/schemaStudio';
import type { WorkspaceCandidate } from '@/types/workspaces';

/** Read only. A saved Studio candidate is never treated as the effective binding. */
export function useWorkspaceDraftSchema(
  candidate: WorkspaceCandidate,
  authoring?: Pick<WorkspaceAuthoringView, 'workspaceRevision' | 'currentSchema'> | null
) {
  const key = JSON.stringify([
    candidate.projectId,
    candidate.id,
    candidate.revision,
    candidate.schemaBindings,
    authoring?.currentSchema === undefined
      ? null
      : { workspaceRevision: authoring.workspaceRevision, currentSchema: authoring.currentSchema },
  ]);
  const [result, setResult] = useState<{
    key: string;
    definition?: Record<string, unknown>;
    hasCandidate?: boolean;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    const [projectId, workspaceId, workspaceRevision, bindings, view] = JSON.parse(key) as [
      string,
      string,
      number | null,
      WorkspaceCandidate['schemaBindings'],
      Pick<WorkspaceAuthoringView, 'workspaceRevision' | 'currentSchema'> | null,
    ];
    const binding = bindings[0];
    if (!binding) {
      setResult({ key });
      return;
    }
    const matches = async (schema: Record<string, unknown>) =>
      !binding.schemaHash || (await definitionHash(schema)) === binding.schemaHash;
    async function read() {
      const unavailable = 'The exact bound Schema is unavailable. Open Studio to inspect it.';
      const editRead = readStudioSchemaEditCandidate(projectId, workspaceId).catch(() => null);
      if (view?.currentSchema !== undefined) {
        const snapshot = view.currentSchema;
        const edit = await editRead;
        const hasCandidate = !!edit && edit.authoringDraft?.resultSchemaHash !== binding.schemaHash;
        // Never replace a missing or mismatched authoritative snapshot with the
        // latest candidate or a historical action's definition.
        if (
          (workspaceRevision === null || view.workspaceRevision === workspaceRevision) &&
          snapshot.status === 'bound' &&
          snapshot.definition &&
          canonicalJson(snapshot.bindings as YValue) ===
            canonicalJson(bindings as unknown as YValue) &&
          (!binding.schemaHash || snapshot.schemaHash === binding.schemaHash) &&
          (await definitionHash(snapshot.definition)) === snapshot.schemaHash
        )
          return { definition: snapshot.definition, hasCandidate };
        return { hasCandidate, error: unavailable };
      }
      // Published definitions are immutable. Match the exact version, never a latest/default schema.
      const [registry, history, edit] = await Promise.all([
        loadYSchemaArtifactRegistry(projectId).catch(() => null),
        loadProjectYSchemaVersions(projectId).catch(() => null),
        editRead,
      ]);
      const hasCandidate = !!edit && edit.authoringDraft?.resultSchemaHash !== binding.schemaHash;
      const manifests = [...(history?.items ?? []), ...(registry?.items ?? [])];
      for (const manifest of manifests) {
        if (
          manifest.canonicalName !== (binding.canonicalName ?? binding.schemaName) ||
          String(manifest.version) !== binding.version
        )
          continue;
        if (
          manifest.schema &&
          typeof manifest.schema === 'object' &&
          !Array.isArray(manifest.schema) &&
          (await matches(manifest.schema as Record<string, unknown>))
        ) {
          return { definition: manifest.schema as Record<string, unknown>, hasCandidate };
        }
      }
      // Workspace-local definitions already have a read-only Studio preview path.
      // Reconstruct only from the frozen bound sources, and accept only the bound hash.
      if (binding.schemaHash && binding.studioSources?.length) {
        const candidates = await listStudioCandidates(projectId);
        const candidateIds = binding.studioSources.map(
          (source) =>
            candidates.find((item) => {
              const actual = item.source;
              return (
                actual &&
                item.available &&
                actual.artifactVersionId === source.artifactVersionId &&
                actual.hash === source.hash &&
                actual.projectId === source.projectId &&
                actual.canonicalName === source.canonicalName &&
                actual.version === source.version
              );
            })?.id
        );
        if (candidateIds.every((id): id is string => !!id)) {
          const preview = await previewStudioSelection(projectId, {
            candidateIds: [...new Set(candidateIds)],
            workspaceId,
            ...(edit?.authoringDraft?.resultSchemaHash === binding.schemaHash
              ? { schemaEditCandidate: { candidateId: edit.candidateId, revision: edit.revision } }
              : {}),
          });
          if (preview.schemaHash === binding.schemaHash && (await matches(preview.schema)))
            return { definition: preview.schema, hasCandidate };
        }
      }
      return {
        hasCandidate,
        error: unavailable,
      };
    }
    void read().then(
      (value) => {
        if (active) setResult({ key, ...value });
      },
      (error: unknown) => {
        if (active)
          setResult({
            key,
            error: error instanceof Error ? error.message : 'Could not read the bound Schema.',
          });
      }
    );
    return () => {
      active = false;
    };
  }, [key]);
  const current = result?.key === key ? result : undefined;
  return {
    definition: current?.definition,
    hasCandidate: current?.hasCandidate,
    error: current?.error,
    loading: !!candidate.schemaBindings.length && !current,
  };
}

async function definitionHash(schema: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(canonicalJson(schema as YValue));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
