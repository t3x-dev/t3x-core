'use client';

import type { WorkspaceAuthoringView } from '@t3x-dev/api-client';
import { ChevronRight, FileText, Folder } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo, useState } from 'react';
import { SchemaDefinitionTree } from '@/components/schemas/SchemaDefinitionTree';
import { getProjectIdRepoPath } from '@/domain/project/repoPath';
import { schemaFieldRows } from '@/domain/schemas/schemaFieldEditing';
import { authoringSemanticPath } from '@/domain/workspaces/authoringReview';
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
  schemaControl,
  subject = 'content',
  onSubjectChange,
  onEdit,
  onDiscuss,
}: {
  candidate: WorkspaceCandidate;
  current: unknown;
  revision?: number;
  loading?: boolean;
  error?: string | null;
  enabled: boolean;
  stagedCount?: number;
  authoring?: Pick<WorkspaceAuthoringView, 'workspaceRevision' | 'currentSchema'> | null;
  schemaControl?: ReactNode;
  subject?: 'content' | 'schema';
  onSubjectChange?: (subject: 'content' | 'schema') => void;
  onEdit?: (subject: 'content' | 'schema', path?: string) => void;
  onDiscuss?: (subject: 'content' | 'schema', path: string) => void;
}) {
  const [selectedContent, setSelectedContent] = useState<string>();
  const schema = useWorkspaceDraftSchema(candidate, authoring);
  const pending = useWorkspaceSchemaPending(candidate.projectId, candidate.id, candidate.revision);
  const binding = candidate.schemaBindings[0];
  const selectedNode = walkDraftStructure(current).find((item) => item.path === selectedContent);
  const semanticPath = selectedNode
    ? (authoringSemanticPath(selectedNode.path) ?? selectedNode.path)
    : undefined;
  const corresponding =
    schema.definition && semanticPath
      ? schemaFieldRows(schema.definition).find((row) => row.semanticPath === semanticPath)
      : undefined;
  const params = new URLSearchParams({
    tab: 'schemas',
    schemaView: 'studio',
    branch: candidate.targetBranch,
    workspace: candidate.id,
  });
  const studioHref = `${getProjectIdRepoPath(candidate.projectId)}?${params}`;
  return (
    <section aria-label="Current Draft" className={styles.currentDraft}>
      <header className={styles.structureToolbar}>
        {onSubjectChange ? (
          <nav className={styles.subjectTabs} aria-label="Draft subject">
            {(['content', 'schema'] as const).map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={subject === item}
                onClick={() => onSubjectChange(item)}
              >
                {item === 'content' ? 'Content' : 'Schema'}
              </button>
            ))}
          </nav>
        ) : (
          <h2>Current Draft</h2>
        )}
        {revision !== undefined ? <span title="Current Draft revision">r{revision}</span> : null}
        {!onEdit ? <small>Read-only</small> : null}
      </header>
      <div className={styles.currentDraftBody}>
        {stagedCount > 0 ? (
          <p className={styles.currentDraftNotice}>
            Includes {stagedCount} ungrouped local changes · not saved
          </p>
        ) : null}
        <section
          hidden={Boolean(onSubjectChange) && subject !== 'content'}
          className={styles.currentDraftSection}
        >
          {!onSubjectChange ? <h3>Content</h3> : null}
          {error ? <p role="alert">{error}</p> : null}
          {current !== undefined ? (
            <CurrentDraftContentTree
              key={candidate.id}
              current={current}
              onSelect={setSelectedContent}
              selectedPath={selectedContent}
            />
          ) : (
            <p>
              {loading
                ? 'Loading current Draft…'
                : !enabled
                  ? 'Enable Draft activity in Chat to load the content.'
                  : 'Current Draft is unavailable.'}
            </p>
          )}
          {selectedNode ? (
            <div className="flex flex-wrap gap-2 p-2 text-xs">
              <span>{semanticPath}</span>
              {corresponding ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => onSubjectChange?.('schema')}
                >
                  View Schema definition
                </button>
              ) : (
                <span>No matching Schema field.</span>
              )}
              {onDiscuss ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => onDiscuss('content', selectedNode.path)}
                >
                  Ask AI
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
        <section
          hidden={Boolean(onSubjectChange) && subject !== 'schema'}
          className={styles.currentDraftSection}
        >
          {!onSubjectChange ? <h3>Structure definition · YSchema</h3> : null}
          {schemaControl ? (
            <div className={styles.schemaBindingControl}>
              <span>Bound Schema</span>
              {schemaControl}
            </div>
          ) : null}
          {schemaControl ? null : binding ? (
            <p className={styles.currentDraftBinding} title={binding.schemaHash}>
              {binding.schemaName} · {binding.version} <span>Bound</span>
            </p>
          ) : (
            <p>No Schema bound.</p>
          )}
          {corresponding ? (
            <div className="flex flex-wrap gap-2 p-2 text-xs">
              <strong>{corresponding.semanticPath}</strong>
              <button
                type="button"
                className="underline"
                onClick={() => onSubjectChange?.('content')}
              >
                Back to selected content
              </button>
              {onEdit ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => onEdit('schema', corresponding.semanticPath)}
                >
                  Edit definition
                </button>
              ) : null}
              {onDiscuss ? (
                <button
                  type="button"
                  className="underline"
                  onClick={() => onDiscuss('schema', corresponding.semanticPath)}
                >
                  Ask AI
                </button>
              ) : null}
            </div>
          ) : null}
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
          {onEdit && (schema.hasCandidate || pending.data?.pending) ? (
            <button type="button" className="text-sm underline" onClick={() => onEdit('schema')}>
              Resume Schema candidate
            </button>
          ) : null}
          <Link href={studioHref}>Open Schema Studio →</Link>
        </section>
      </div>
    </section>
  );
}

export function CurrentDraftContentTree({
  current,
  onSelect,
  selectedPath,
}: {
  current: unknown;
  onSelect?: (path: string) => void;
  selectedPath?: string;
}) {
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
          <button
            key={node.path}
            type="button"
            title={node.path}
            aria-pressed={selectedPath === node.path}
            aria-label={`Select content ${node.path}`}
            className={styles.currentDraftRow}
            style={style}
            onClick={() => onSelect?.(node.path)}
          >
            {row}
          </button>
        );
      })}
    </div>
  );
}
