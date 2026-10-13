import { CheckCircle2 } from 'lucide-react';
import {
  composeNodeContent,
  composeNodeTitle,
  composePathLabel,
  composeTextDiff,
  composeValueChangeLabels,
  composeValueLabel,
} from '@/domain/composePresentation';
import { isComposeObject } from '@/domain/workspaces/composeObjectChanges';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import styles from './ComposeActivityTimeline.module.css';
import { ComposeObjectFieldSummary } from './ComposeObjectFieldSummary';

function ValueChange({ before, after, kind }: { before: string; after: string; kind: string }) {
  if (kind === 'added') return <ins title={after}>{after}</ins>;
  if (kind === 'removed') return <del title={before}>{before}</del>;
  if (before === after) return <span title={after}>{after}</span>;
  return (
    <span title={`${before} → ${after}`}>
      {composeTextDiff(before, after).map((part, index) =>
        part.kind === 'removed' ? (
          <del key={index}>{part.text}</del>
        ) : part.kind === 'added' ? (
          <ins key={index}>{part.text}</ins>
        ) : (
          part.text
        )
      )}
    </span>
  );
}

/** Keep object ownership while selecting Details directly. */
export function ComposeActivityChangeRow({
  operation,
  selected,
  applied,
  disabled = false,
  onSelect,
}: {
  operation: WorkspaceYOpsDraftOperation;
  selected: boolean;
  applied: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const kind =
    operation.beforeValue === undefined
      ? 'added'
      : operation.afterValue === undefined
        ? 'removed'
        : 'modified';
  const title =
    composeNodeTitle(operation.afterValue) ??
    composeNodeTitle(operation.beforeValue) ??
    composePathLabel(operation.path, operation.id);
  const values =
    kind === 'added' && composeNodeTitle(operation.afterValue)
      ? {
          before: 'Absent',
          after: composeNodeContent(operation.afterValue) ?? 'No content recorded',
        }
      : composeValueChangeLabels(operation.beforeValue, operation.afterValue);
  const object = isComposeObject(operation.beforeValue) || isComposeObject(operation.afterValue);

  return (
    <button
      className={styles.changeRow}
      data-object={object}
      type="button"
      aria-label={`Inspect ${title}: ${operation.path}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span
        className={styles.changeMark}
        data-kind={kind}
        role="img"
        aria-label={kind === 'added' ? 'Added' : kind === 'removed' ? 'Removed' : 'Modified'}
      >
        {kind === 'added' ? '+' : kind === 'removed' ? '−' : '~'}
      </span>
      <span className={styles.cardLabel} title={title}>
        {title}
      </span>
      <span className={styles.valueSummary} data-object={object}>
        {object ? (
          <ComposeObjectFieldSummary
            operation={operation}
            format={(value) => composeValueLabel(value, 'Absent')}
          />
        ) : (
          <ValueChange before={values.before} after={values.after} kind={kind} />
        )}
      </span>
      {applied ? <CheckCircle2 aria-label="Applied to Draft" className={styles.verified} /> : null}
    </button>
  );
}
