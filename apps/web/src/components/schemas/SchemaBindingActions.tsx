import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isSchemaReleaseBindable } from '@/domain/workspaces/schemaBindings';
import type { SchemaReleasePreview } from '@/types/schemas';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

export type SchemaBindingActionKind = 'workspace';
export type SchemaBindingFeedbackTone = 'error' | 'success' | 'warning';

export interface SchemaBindingActionsState {
  feedback?: {
    message: string;
    tone: SchemaBindingFeedbackTone;
  };
  onApplyToWorkspace: (release: SchemaReleasePreview) => Promise<void>;
  pending: SchemaBindingActionKind | null;
  workspaceTarget?: {
    binding?: WorkspaceSchemaBinding;
    id: string;
    title: string;
  };
}

interface SchemaBindingActionsProps {
  actions: SchemaBindingActionsState;
  selectedRelease: SchemaReleasePreview;
}

export function SchemaBindingActions({ actions, selectedRelease }: SchemaBindingActionsProps) {
  const isRuntimeRelease = isSchemaReleaseBindable(selectedRelease);
  const workspaceMatches = bindingMatchesRelease(actions.workspaceTarget?.binding, selectedRelease);
  const busy = actions.pending !== null;

  return (
    <fieldset
      aria-label="Schema binding actions"
      className="m-0 flex max-w-[280px] flex-col items-end gap-1.5 border-0 p-0"
    >
      <Button
        className="h-[34px] px-3 text-xs"
        disabled={!isRuntimeRelease || !actions.workspaceTarget || workspaceMatches || busy}
        onClick={() => void actions.onApplyToWorkspace(selectedRelease)}
        title={
          !actions.workspaceTarget
            ? 'Open and save a Workspace before applying a Schema directly.'
            : isRuntimeRelease
              ? `Bind this exact version to ${actions.workspaceTarget.title}. Existing commits are not rewritten.`
              : 'This version is view-only and cannot be applied to a Workspace.'
        }
        type="button"
        variant="default"
      >
        {actions.pending === 'workspace' ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : workspaceMatches ? (
          <CheckCircle2 aria-hidden="true" />
        ) : null}
        {!isRuntimeRelease
          ? 'View only'
          : actions.workspaceTarget
            ? workspaceMatches
              ? `Applied to ${actions.workspaceTarget.title}`
              : `Apply to ${actions.workspaceTarget.title}`
            : 'No persisted Workspace'}
      </Button>
      {actions.feedback ? (
        <p
          aria-live="polite"
          className={`text-right text-[11px] leading-4 ${feedbackClassName(actions.feedback.tone)}`}
          role={actions.feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {actions.feedback.message}
        </p>
      ) : null}
    </fieldset>
  );
}

function bindingMatchesRelease(
  binding: WorkspaceSchemaBinding | undefined,
  release: SchemaReleasePreview
): boolean {
  if (!binding) return false;
  const canonicalNameMatches = binding.canonicalName
    ? binding.canonicalName === release.canonicalName
    : binding.schemaName === release.name;
  return (
    canonicalNameMatches &&
    binding.schemaHash === release.schemaHash &&
    binding.schemaName === release.name &&
    binding.version === release.version
  );
}

function feedbackClassName(tone: SchemaBindingFeedbackTone): string {
  if (tone === 'error') return 'text-[var(--status-danger)]';
  if (tone === 'warning') return 'text-[var(--status-warning)]';
  return 'text-[var(--status-success)]';
}
