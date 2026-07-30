import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SchemaReleasePreview } from '@/types/schemas';
import type { WorkspaceSchemaBinding } from '@/types/workspaces';

export type SchemaBindingActionKind = 'project_default' | 'workspace';
export type SchemaBindingFeedbackTone = 'error' | 'success' | 'warning';

export interface SchemaBindingActionsState {
  defaultBinding?: WorkspaceSchemaBinding;
  feedback?: {
    message: string;
    tone: SchemaBindingFeedbackTone;
  };
  onApplyToWorkspace: (release: SchemaReleasePreview) => Promise<void>;
  onSetProjectDefault: (release: SchemaReleasePreview) => Promise<void>;
  pending: SchemaBindingActionKind | null;
  workspaceTarget?: {
    binding?: WorkspaceSchemaBinding;
    id: string;
    title: string;
  };
}

interface SchemaBindingActionsProps {
  actions: SchemaBindingActionsState;
  currentRelease: SchemaReleasePreview | null;
  selectedRelease: SchemaReleasePreview;
}

export function SchemaBindingActions({
  actions,
  currentRelease,
  selectedRelease,
}: SchemaBindingActionsProps) {
  const isRuntimeRelease =
    selectedRelease.status === 'active' && selectedRelease.id === currentRelease?.id;
  const defaultMatches = bindingMatchesRelease(actions.defaultBinding, selectedRelease);
  const workspaceMatches = bindingMatchesRelease(actions.workspaceTarget?.binding, selectedRelease);
  const busy = actions.pending !== null;

  return (
    <section
      aria-label="Schema binding actions"
      className="flex flex-col gap-3 border-t border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-4 py-3 min-[961px]:flex-row min-[961px]:items-center min-[961px]:justify-between"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[var(--text-tertiary)]">
            Workspace binding
          </p>
          <Badge variant={isRuntimeRelease ? 'success' : 'pending'}>
            {isRuntimeRelease ? 'runtime available' : 'view only'}
          </Badge>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          Binding a Schema never rewrites commits. Existing Workspace candidates are marked stale,
          saved, and regenerated from their sources.
        </p>
        {actions.feedback ? (
          <p
            aria-live="polite"
            className={`mt-1 text-xs ${feedbackClassName(actions.feedback.tone)}`}
            role={actions.feedback.tone === 'error' ? 'alert' : 'status'}
          >
            {actions.feedback.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-none flex-col gap-2 min-[481px]:flex-row min-[961px]:justify-end">
        <Button
          className="h-8 px-3 text-xs"
          disabled={!isRuntimeRelease || defaultMatches || busy}
          onClick={() => void actions.onSetProjectDefault(selectedRelease)}
          title={
            isRuntimeRelease
              ? 'Use this Schema for newly created Workspaces.'
              : 'Only the registered current release can be bound to a Workspace.'
          }
          type="button"
          variant="canvas-outline"
        >
          {actions.pending === 'project_default' ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : defaultMatches ? (
            <CheckCircle2 aria-hidden="true" />
          ) : null}
          {defaultMatches ? 'Default for new Workspaces' : 'Use for new Workspaces'}
        </Button>
        <Button
          className="h-8 px-3 text-xs"
          disabled={!isRuntimeRelease || !actions.workspaceTarget || workspaceMatches || busy}
          onClick={() => void actions.onApplyToWorkspace(selectedRelease)}
          title={
            !actions.workspaceTarget
              ? 'Open and save a Workspace before applying a Schema directly.'
              : isRuntimeRelease
                ? `Bind this Schema to ${actions.workspaceTarget.title}.`
                : 'Only the registered current release can be bound to a Workspace.'
          }
          type="button"
          variant="default"
        >
          {actions.pending === 'workspace' ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : workspaceMatches ? (
            <CheckCircle2 aria-hidden="true" />
          ) : null}
          {actions.workspaceTarget
            ? workspaceMatches
              ? `Applied to ${actions.workspaceTarget.title}`
              : `Apply to ${actions.workspaceTarget.title}`
            : 'No persisted Workspace'}
        </Button>
      </div>
    </section>
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
    binding.schemaName === release.name &&
    binding.version === release.version
  );
}

function feedbackClassName(tone: SchemaBindingFeedbackTone): string {
  if (tone === 'error') return 'text-[var(--status-danger)]';
  if (tone === 'warning') return 'text-[var(--status-warning)]';
  return 'text-[var(--status-success)]';
}
