import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Pencil } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  composeNodeContent,
  composeNodeTitle,
  composePathLabel,
  humanizeComposeIdentifier,
} from '@/domain/composePresentation';
import { authoringSemanticPath } from '@/domain/workspaces/authoringReview';
import type { WorkspaceYOpsDraftOperation } from '@/types/workspaces';
import styles from './ComposeDraftChanges.module.css';
import { isSimpleDraftValue } from './ComposeDraftValueEditor';

function valueLabel(value: unknown) {
  if (value === undefined) return 'Not present';
  if (typeof value === 'string') return value || 'Empty text';
  return composeNodeContent(value) ?? composeNodeTitle(value) ?? JSON.stringify(value);
}

export function ComposeDraftChangeRow({
  operation,
  Icon,
  selected,
  onSelect,
  onEdit,
}: {
  operation: WorkspaceYOpsDraftOperation;
  Icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const before = operation.beforeValue;
  const after = operation.afterValue;
  const kind = before === undefined ? 'added' : after === undefined ? 'removed' : 'modified';
  const slot = operation.path.split('/slots/')[1];
  const title = slot
    ? humanizeComposeIdentifier(slot)
    : (composeNodeTitle(after) ?? composeNodeTitle(before) ?? composePathLabel(operation.path));
  const beforeText = valueLabel(before);
  const afterText = valueLabel(after);
  const displayPath = authoringSemanticPath(operation.path) ?? operation.path;
  const canEdit = Boolean(operation.path) && after !== undefined && isSimpleDraftValue(after);
  const disabledReason = !operation.path
    ? 'This value has no field path available for editing.'
    : after === undefined
      ? 'This value is no longer present in the current Draft.'
      : 'Objects and arrays cannot be edited here. Select a text, number, or boolean field, or use Ask AI.';

  return (
    <li className={styles.row} data-selected={selected}>
      <button
        className={styles.select}
        type="button"
        aria-label={`Inspect ${title}: ${operation.path}`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className={styles.icon}>
          <Icon aria-hidden="true" />
        </span>
        <span className={styles.heading}>
          <span className={styles.title}>
            <strong title={title}>{title}</strong>
            <small data-kind={kind}>
              {kind === 'added' ? 'Added' : kind === 'removed' ? 'Removed' : 'Modified'}
            </small>
          </span>
          <code title={operation.path}>{displayPath}</code>
        </span>
        <span className={styles.values} aria-label="Base to current Draft">
          <span className={styles.before} data-absent={before === undefined} title={beforeText}>
            {beforeText}
          </span>
          <ArrowRight aria-hidden="true" />
          <span className={styles.after} data-absent={after === undefined} title={afterText}>
            {afterText}
          </span>
        </span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={styles.editTrigger}
            tabIndex={canEdit ? undefined : 0}
            aria-label={canEdit ? undefined : `Edit unavailable: ${title}`}
          >
            <button
              className={styles.edit}
              type="button"
              disabled={!canEdit}
              onClick={onEdit}
              aria-label={`Edit ${title}`}
            >
              <Pencil aria-hidden="true" /> Edit
            </button>
          </span>
        </TooltipTrigger>
        {!canEdit ? (
          <TooltipContent side="top" sideOffset={6} className="max-w-72">
            {disabledReason}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </li>
  );
}
