'use client';

import type {
  WorkspaceFullSchemaReview,
  WorkspaceSchemaDefinitionSnapshot,
} from '@t3x-dev/api-client';
import { dump } from 'js-yaml';
import { useMemo, useState } from 'react';
import { StateFieldTable } from '@/components/project/StateFieldTable';
import { SchemaDefinitionTree } from '@/components/schemas/SchemaDefinitionTree';
import {
  filterCollapsedStateRows,
  filterStateStructureRows,
  isStateStructureRowExpanded,
  type StateFieldTreeRow,
} from '@/domain/project/stateFieldTable';
import {
  formatDraftValue,
  isSemanticEnvelope,
  walkDraftStructure,
} from '@/domain/workspaces/draftStructure';
import { WorkspaceReviewCodeView } from './WorkspaceReviewCodeView';
import type { WorkspaceReviewPane } from './WorkspaceReviewWorkbench';
import styles from './WorkspaceReviewWorkbench.module.css';

/** Both inputs must come from the same Draft read or the same frozen Review. */
export function WorkspaceReviewYaml({
  base,
  result,
  subject,
  branch,
  frozen = false,
}: {
  base: unknown;
  result: unknown;
  subject: 'Content' | 'Schema';
  branch: string;
  frozen?: boolean;
}) {
  return (
    <div className={styles.yamlPair}>
      {(
        [
          [`Base ${subject}`, base],
          [`${frozen ? 'Reviewed' : 'Draft'} ${subject}`, result],
        ] as const
      ).map(([label, value]) => (
        <section key={label} aria-label={label}>
          <h2>{label}</h2>
          {value === undefined ? (
            <p>Unavailable for this revision.</p>
          ) : (
            <div className={styles.codeFrame}>
              <WorkspaceReviewCodeView
                branch={branch}
                rootKey={label.toLowerCase().replaceAll(' ', '-')}
                validationReady={false}
                statusLabel={frozen ? 'Fixed snapshot' : 'Draft preview'}
                yamlText={dump(value, { noRefs: true, sortKeys: true })}
              />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function WorkspaceReviewContentPreview({
  value,
  frozen = false,
  onSelect,
}: {
  value: unknown;
  frozen?: boolean;
  onSelect?: (path: string) => void;
}) {
  const rows = useMemo((): StateFieldTreeRow[] => {
    const semantic = isSemanticEnvelope(value);
    const nodes = walkDraftStructure(value).filter(
      (node) => !semantic || node.path !== 'content/trees'
    );
    if (isSemanticEnvelope(value) && value.content.relations.length)
      nodes.push(...walkDraftStructure({ relations: value.content.relations }));
    return nodes.map((node) => ({
      id: node.path,
      path: node.path,
      parentPath: node.parentPath === 'content/trees' ? null : node.parentPath,
      depth: Math.max(0, node.depth - (semantic && node.path.startsWith('content/trees/') ? 1 : 0)),
      key: node.key,
      expandable: node.expandable,
      type:
        node.kind === 'sequence'
          ? 'array'
          : node.kind !== 'scalar'
            ? 'object'
            : node.value === null
              ? 'null'
              : typeof node.value,
      value: node.kind === 'scalar' ? formatDraftValue(node.value) : '-',
      issueCount: 0,
      sourceOp: '-',
      status: 'unchanged',
      statusLabel: 'unchanged',
    }));
  }, [value]);
  const [query, setQuery] = useState('');
  const [expansion, setExpansion] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string>();
  const expanded = (row: StateFieldTreeRow) =>
    query.trim().length > 0 || isStateStructureRowExpanded(row, expansion);
  const visible = query.trim()
    ? filterStateStructureRows(rows, query)
    : filterCollapsedStateRows(rows, expanded);
  const expandAll = (open: boolean) =>
    setExpansion(
      Object.fromEntries(rows.filter((row) => row.expandable).map((row) => [row.id, open]))
    );
  return (
    <section className={styles.preview} aria-label="Content result preview">
      <h2>{frozen ? 'Reviewed content' : 'Draft content'}</h2>
      {value === undefined ? (
        <p>The complete content is unavailable for this revision.</p>
      ) : (
        <StateFieldTable
          rows={visible}
          query={query}
          onQueryChange={setQuery}
          onExpandAll={() => expandAll(true)}
          onCollapseAll={() => expandAll(false)}
          selectedRowId={selectedId}
          isExpanded={expanded}
          onSelectRow={(row) => {
            setSelectedId(row.id);
            if (row.expandable)
              setExpansion((current) => ({
                ...current,
                [row.id]: !isStateStructureRowExpanded(row, current),
              }));
            onSelect?.(row.path);
          }}
        />
      )}
    </section>
  );
}

export function WorkspaceReviewSchemaView({
  review,
  current,
  pane,
  branch,
  frozen = false,
}: {
  review?: WorkspaceFullSchemaReview | null;
  current?: WorkspaceSchemaDefinitionSnapshot;
  pane: WorkspaceReviewPane;
  branch: string;
  frozen?: boolean;
}) {
  // Never substitute current Draft definitions for missing historical facts.
  const draft = review?.draft ?? (frozen ? undefined : current);
  const definition = draft?.status === 'unknown' ? undefined : draft?.definition;
  return (
    <section className={styles.schemaView} aria-label="Schema review">
      {review?.base.status === 'unknown' ? (
        <p role="alert">
          The exact Base Schema is unavailable. Acceptance is blocked until it is recovered.
        </p>
      ) : null}
      {pane === 'changes' ? (
        review ? (
          <table className={styles.definitionChanges}>
            <thead>
              <tr>
                <th>Field or rule</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {review.changes.length ? (
                review.changes.map((change) => (
                  <tr key={`${change.kind}:${change.path}`}>
                    <td>
                      {change.kind} {change.path}
                    </td>
                    <td>{change.summary}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>
                    {review.base.status === 'unknown'
                      ? 'Comparison unavailable.'
                      : 'No Schema definition changes.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <p>
            {frozen
              ? 'The complete Schema comparison is unavailable for this snapshot.'
              : 'Prepare review to compare the exact Base and Draft Schema. Preview shows the current applied definition.'}
          </p>
        )
      ) : pane === 'yaml' ? (
        <WorkspaceReviewYaml
          branch={branch}
          subject="Schema"
          frozen={frozen}
          base={review?.base.status === 'unknown' ? undefined : review?.base.definition}
          result={definition}
        />
      ) : (
        <section className={styles.preview} aria-label="Schema result preview">
          <h2>{frozen ? 'Reviewed Schema' : 'Draft Schema'}</h2>
          {definition ? (
            Object.keys(definition.nodes ?? {}).length ? (
              <SchemaDefinitionTree schema={definition} />
            ) : (
              <p>No nodes defined.</p>
            )
          ) : (
            <p>
              {draft?.status === 'unbound'
                ? 'No Schema is bound to this revision.'
                : 'The exact Schema definition is unavailable.'}
            </p>
          )}
        </section>
      )}
      {review?.contentValidation === 'not_applicable' ? (
        <p>No business content yet. Content validation is not applicable to this review.</p>
      ) : null}
    </section>
  );
}
