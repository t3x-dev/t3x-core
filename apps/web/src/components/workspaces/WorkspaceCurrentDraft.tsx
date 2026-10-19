'use client';

import type { WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { ChevronDown, ChevronRight, FileText, Folder, Layers } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SchemaDefinitionTree } from '@/components/schemas/SchemaDefinitionWorkbench';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import {
  formatDraftValue,
  isSemanticEnvelope,
  walkDraftStructure,
} from '@/domain/workspaces/draftStructure';
import { useWorkspaceDraftSchema } from '@/hooks/schemas/useWorkspaceDraftSchema';
import { useWorkspaceSchemaPending } from '@/hooks/schemas/useWorkspaceSchemaPending';
import type { WorkspaceCandidate } from '@/types/workspaces';
import styles from './WorkspaceComposeSurface.module.css';

export function WorkspaceCurrentDraft({
  candidate,
  current,
  revision,
  loading,
  error,
  enabled,
  stagedCount = 0,
  authoring,
}: {
  candidate: WorkspaceCandidate;
  current: unknown;
  revision?: number;
  loading?: boolean;
  error?: string | null;
  enabled: boolean;
  stagedCount?: number;
  authoring?: Pick<WorkspaceAuthoringView, 'workspaceRevision' | 'currentSchema'> | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const schema = useWorkspaceDraftSchema(candidate, authoring);
  const pending = useWorkspaceSchemaPending(candidate.projectId, candidate.id, candidate.revision);
  const binding = candidate.schemaBindings[0];
  const params = new URLSearchParams({
    tab: 'schemas',
    schemaView: 'studio',
    branch: candidate.targetBranch,
    workspace: candidate.id,
  });
  const studioHref = `${getProjectIdRepoPath(candidate.projectId)}?${params}`;
  return (
    <section aria-label="Current Draft" className={styles.currentDraft}>
      <header className={styles.currentDraftHeader}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label="Toggle current Draft"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          <Layers aria-hidden="true" />
          <h2>Current Draft</h2>
        </button>
        {revision !== undefined ? <span>r{revision}</span> : null}
        <small>Read-only</small>
      </header>
      {expanded ? (
        <div className={styles.currentDraftBody}>
          {stagedCount > 0 ? (
            <p className={styles.currentDraftNotice}>
              Includes {stagedCount} ungrouped local changes · not saved
            </p>
          ) : null}
          <details open className={styles.currentDraftSection}>
            <summary>Content</summary>
            {error ? <p role="alert">{error}</p> : null}
            {current !== undefined ? (
              <CurrentDraftContentTree key={candidate.id} current={current} />
            ) : (
              <p>
                {loading
                  ? 'Loading current Draft…'
                  : !enabled
                    ? 'Enable Draft activity in Chat to load the content.'
                    : 'Current Draft is unavailable.'}
              </p>
            )}
          </details>
          <details open className={styles.currentDraftSection}>
            <summary>Structure definition · YSchema</summary>
            {binding ? (
              <p className={styles.currentDraftBinding} title={binding.schemaHash}>
                {binding.schemaName} · {binding.version} <span>Bound</span>
              </p>
            ) : (
              <p>No Schema bound.</p>
            )}
            {schema.loading ? (
              <p>Loading bound Schema…</p>
            ) : schema.definition ? (
              <div className={styles.currentDraftSchema}>
                {Object.keys(schema.definition.nodes ?? {}).length ? (
                  <SchemaDefinitionTree schema={schema.definition} />
                ) : (
                  <p>No nodes defined.</p>
                )}
              </div>
            ) : schema.error ? (
              <output>{schema.error}</output>
            ) : null}
            {schema.hasCandidate || pending.data?.pending ? (
              <p className={styles.currentDraftNotice}>
                Schema candidate available in Studio · current binding shown above
                {pending.data?.status === 'stale' ? ' · needs a new preview' : ''}
              </p>
            ) : null}
            <Link href={studioHref}>Open Schema Studio →</Link>
          </details>
        </div>
      ) : null}
    </section>
  );
}

function CurrentDraftContentTree({ current }: { current: unknown }) {
  const semantic = isSemanticEnvelope(current);
  const nodes = useMemo(() => {
    const content = walkDraftStructure(current).filter(
      (node) => !semantic || node.path !== 'content/trees'
    );
    if (semantic && isSemanticEnvelope(current) && current.content.relations.length)
      return [...content, ...walkDraftStructure({ relations: current.content.relations })];
    return content;
  }, [current, semantic]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(nodes.filter((node) => node.depth === (semantic ? 1 : 0)).map((node) => node.path))
  );
  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const visible = nodes.filter((node) => {
    let parent = byPath.get(node.parentPath ?? '');
    while (parent) {
      if (!expanded.has(parent.path)) return false;
      parent = byPath.get(parent.parentPath ?? '');
    }
    return true;
  });
  if (!nodes.length) return <p>No content yet.</p>;
  return (
    <div className={styles.currentDraftTree}>
      {visible.map((node) => {
        const value = node.kind === 'scalar' ? formatDraftValue(node.value) : '';
        const row = (
          <>
            <ChevronRight
              aria-hidden="true"
              className={styles.currentDraftChevron}
              data-expanded={expanded.has(node.path)}
              data-visible={node.expandable}
            />
            {node.kind === 'scalar' ? (
              <FileText aria-hidden="true" />
            ) : (
              <Folder aria-hidden="true" />
            )}
            <span>{node.key}</span>
            {value ? (
              <small title={value}>{value}</small>
            ) : node.kind === 'scalar' ? (
              <small title="Empty string">""</small>
            ) : null}
          </>
        );
        const style = {
          paddingLeft: `${4 + Math.max(0, node.depth - (semantic && node.path.startsWith('content/trees/') ? 1 : 0)) * 14}px`,
        };
        return node.expandable ? (
          <button
            key={node.path}
            type="button"
            title={node.path}
            aria-label={`Content ${node.path}`}
            aria-expanded={expanded.has(node.path)}
            className={styles.currentDraftRow}
            style={style}
            onClick={() =>
              setExpanded((old) => {
                const next = new Set(old);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              })
            }
          >
            {row}
          </button>
        ) : (
          <div key={node.path} title={node.path} className={styles.currentDraftRow} style={style}>
            {row}
          </div>
        );
      })}
    </div>
  );
}
