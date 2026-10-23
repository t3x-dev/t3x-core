import { CheckCircle2, Pencil } from 'lucide-react';
import navigationStyles from '@/components/project/StateNavigationControls.module.css';

export function WorkspaceStageNavigation({
  mode,
  onModeChange,
}: {
  mode?: 'compose' | 'review';
  onModeChange: (mode: 'compose' | 'review') => void;
}) {
  return (
    <div aria-label="Workspace stage" className={navigationStyles.segments} role="tablist">
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
        onClick={() => onModeChange('review')}
        role="tab"
        type="button"
      >
        <CheckCircle2 aria-hidden="true" /> Review
      </button>
    </div>
  );
}
