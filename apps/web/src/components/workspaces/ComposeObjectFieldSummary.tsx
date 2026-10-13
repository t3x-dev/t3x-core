import { ArrowRight } from 'lucide-react';
import { composeObjectFieldChanges } from '@/domain/workspaces/composeObjectChanges';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import styles from './ComposeObjectFields.module.css';

/** The object stays selectable as one row; every changed field remains readable. */
export function ComposeObjectFieldSummary({
  operation,
  format,
}: {
  operation: WorkspaceYOpsDraftOperation;
  format: (value: WorkspaceYOpsDraftOperation['beforeValue']) => string;
}) {
  const fields = composeObjectFieldChanges(operation.beforeValue, operation.afterValue);
  const change = operation.objectChange;
  if (change?.beforePath && change.afterPath && change.beforePath !== change.afterPath)
    fields.push({
      scope: 'structure',
      key: 'path',
      before: change.beforePath,
      after: change.afterPath,
    });
  return (
    // biome-ignore lint/a11y/useSemanticElements: This is inline comparison text inside a button, not a form fieldset.
    <span className={styles.fields} role="group" aria-label={`${fields.length} changed fields`}>
      {fields.map((field) => (
        <span className={styles.field} key={`${field.scope}:${field.key}`}>
          <code title={field.key}>{field.key}:</code>
          <span
            className={styles.values}
            title={`${format(field.before)} → ${format(field.after)}`}
          >
            <del data-absent={field.before === undefined}>{format(field.before)}</del>
            <ArrowRight aria-hidden="true" />
            <ins data-absent={field.after === undefined}>{format(field.after)}</ins>
          </span>
        </span>
      ))}
      {!fields.length ? (
        <span>
          Object{' '}
          {operation.beforeValue === undefined
            ? 'added'
            : operation.afterValue === undefined
              ? 'removed'
              : 'unchanged'}
        </span>
      ) : null}
    </span>
  );
}
