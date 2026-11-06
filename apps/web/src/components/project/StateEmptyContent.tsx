'use client';

import { Braces, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { schemaFieldRows } from '@/domain/schemas/schemaFieldEditing';
import type { CommittedSchemaState } from '@/hooks/commits/useCommittedSchema';
import styles from './StateInspection.module.css';

export function StateEmptyContent({
  schema,
  workspaceHref,
  schemaHref,
  initiallyExpanded = true,
}: {
  schema?: CommittedSchemaState;
  workspaceHref?: string;
  schemaHref?: string;
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const id = useId();
  const [openFields, setOpenFields] = useState<Set<string>>(new Set());
  const definition = schema?.snapshot?.definition;
  const fields = definition ? schemaFieldRows(definition) : [];
  const fieldsByPath = new Map(fields.map((field) => [field.path, field]));
  const visibleFields =
    fields.length <= 12
      ? fields
      : fields.filter((field) => {
          let parent = field.parentPath;
          while (parent) {
            if (!openFields.has(parent)) return false;
            parent = fieldsByPath.get(parent)?.parentPath ?? null;
          }
          return true;
        });
  return (
    <section aria-label="Empty content" className={styles.emptyContent}>
      <h3>No Content yet</h3>
      <p>
        {definition
          ? 'Schema is committed. This version has no stored Content yet.'
          : 'This version has no stored Content yet.'}
      </p>
      <div className={styles.emptyActions}>
        {workspaceHref ? <Link href={workspaceHref}>Open Workspace</Link> : null}
        {schemaHref ? <Link href={schemaHref}>View Schema</Link> : null}
      </div>
      {schema?.loading ? (
        <output>Loading this version’s Schema…</output>
      ) : schema?.error ? (
        <output>
          Schema details unavailable.{' '}
          <button type="button" onClick={schema.retry}>
            Retry
          </button>
        </output>
      ) : definition ? (
        <div className={styles.expected}>
          <button
            type="button"
            className={styles.expectedToggle}
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronDown /> : <ChevronRight />}
            <Braces />
            Expected structure <span>From committed Schema · No stored values</span>
          </button>
          {expanded ? (
            <div id={id}>
              <p>
                Fields below describe what can be filled in. Defaults and examples are not stored
                Content.
              </p>
              {fields.length ? (
                <ul className={styles.expectedFields}>
                  {visibleFields.map((field) => (
                    <li key={field.path} style={{ paddingLeft: 12 + field.depth * 24 }}>
                      <span className={styles.expectedName}>
                        {field.expandable && fields.length > 12 ? (
                          <button
                            type="button"
                            aria-label={`${openFields.has(field.path) ? 'Collapse' : 'Expand'} expected ${field.name}`}
                            aria-expanded={openFields.has(field.path)}
                            onClick={() =>
                              setOpenFields((current) => {
                                const next = new Set(current);
                                if (next.has(field.path)) next.delete(field.path);
                                else next.add(field.path);
                                return next;
                              })
                            }
                          >
                            {openFields.has(field.path) ? <ChevronDown /> : <ChevronRight />}
                            {field.name}
                          </button>
                        ) : (
                          field.name
                        )}
                      </span>
                      <span className={styles.expectedDescription}>
                        {typeof field.definition.description === 'string'
                          ? field.definition.description
                          : 'Not filled'}
                      </span>
                      <span className={styles.expectedType}>
                        {typeof field.definition.type === 'string'
                          ? field.definition.type
                          : Array.isArray(field.definition.enum)
                            ? 'enum'
                            : field.kind === 'node'
                              ? 'object'
                              : 'unspecified'}
                        {field.required ? ' · Required' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>This Schema does not declare any fields.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <p className={styles.schemaNote}>
          No committed Schema definition is available for this version.
        </p>
      )}
    </section>
  );
}
