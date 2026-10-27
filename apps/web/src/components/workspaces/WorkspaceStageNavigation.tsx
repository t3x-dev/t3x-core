import { CheckCircle2, Pencil } from 'lucide-react';
import styles from './WorkspaceStageHeader.module.css';

export function WorkspaceStageNavigation({
  mode,
  onModeChange,
  label = 'Workspace stage',
  reviewDisabled = false,
}: {
  mode?: 'compose' | 'review';
  onModeChange: (mode: 'compose' | 'review') => void;
  label?: string;
  reviewDisabled?: boolean;
}) {
  return (
    <div aria-label={label} className={styles.navigation} role="tablist">
      <button
        aria-selected={mode === 'compose'}
        onClick={() => onModeChange('compose')}
        role="tab"
        type="button"
      >
        <Pencil aria-hidden="true" /> Compose
      </button>
      <button
        aria-selected={mode === 'review'}
        disabled={reviewDisabled}
        onClick={() => onModeChange('review')}
        role="tab"
        type="button"
      >
        <CheckCircle2 aria-hidden="true" /> Review
      </button>
    </div>
  );
}
