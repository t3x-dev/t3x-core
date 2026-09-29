'use client';

import { Check, Copy, Info } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatUserFacingError } from '@/domain/format/errors';
import { getProjectIdRepoPath, toRepoSlug } from '@/domain/project/repoPath';
import { projectDescription } from '@/hooks/projects/useProjectSettings';
import type { ProjectDetail } from '@/types/api';
import { SettingsField, SettingsSection } from './SettingsSection';

const DESCRIPTION_LIMIT = 280;

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-app)] pl-3 pr-1">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-primary)]">
        {value}
      </code>
      <Button
        aria-label={`Copy ${label}`}
        className="size-7"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error(`Could not copy ${label}`);
          }
        }}
        size="icon-sm"
        type="button"
        variant="canvas-ghost"
      >
        {copied ? (
          <Check className="size-3.5 text-[var(--status-success)]" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

function RepositoryStats({ project }: { project: ProjectDetail }) {
  const stats = [
    { label: 'Commits', value: project.commits_count ?? project.stats?.commits_count ?? 0 },
    { label: 'Branches', value: project.branches_count ?? 0 },
    { label: 'Drafts', value: project.drafts_count ?? 0 },
    { label: 'Outputs', value: project.outputs_count ?? 0 },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--stroke-default)] bg-[var(--stroke-divider)] sm:grid-cols-4">
      {stats.map((stat) => (
        <div className="bg-[var(--surface-elevated)] px-4 py-3" key={stat.label}>
          <dt className="text-xs font-medium text-[var(--text-tertiary)]">{stat.label}</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ProjectGeneralSettings({
  onSave,
  project,
}: {
  onSave: (input: { description: string; name: string }) => Promise<void>;
  project: ProjectDetail;
}) {
  const savedDescription = projectDescription(project);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(savedDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const dirty = trimmedName !== project.name || trimmedDescription !== savedDescription;
  const nextSlug = toRepoSlug(trimmedName, project.project_id);
  const slugChanges = nextSlug !== toRepoSlug(project.name, project.project_id);
  const stableLink =
    typeof window === 'undefined'
      ? getProjectIdRepoPath(project.project_id)
      : `${window.location.origin}${getProjectIdRepoPath(project.project_id)}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedName) {
      setError('Repository name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ description: trimmedDescription, name: trimmedName });
      toast.success('Repository details saved');
    } catch (cause) {
      setError(formatUserFacingError(cause, 'Failed to save repository details.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsSection
      description="How this repository is named and described wherever it is listed."
      icon={Info}
      id="general"
      title="General"
    >
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <SettingsField
          hint="Shown in the project header and directory."
          htmlFor="settings-repo-name"
          label="Repository name"
        >
          <Input
            aria-invalid={error && !trimmedName ? 'true' : undefined}
            disabled={saving}
            id="settings-repo-name"
            maxLength={255}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            value={name}
          />
          {slugChanges && trimmedName ? (
            <p className="mt-1.5 text-xs text-[var(--status-warning)]">
              The shareable path becomes <code className="font-mono">…/{nextSlug}</code>. Links that
              use the project ID keep working.
            </p>
          ) : null}
        </SettingsField>

        <SettingsField
          hint="A sentence about the state this repository holds."
          htmlFor="settings-repo-description"
          label="Description"
        >
          <Textarea
            className="min-h-[76px] resize-y"
            disabled={saving}
            id="settings-repo-description"
            maxLength={DESCRIPTION_LIMIT}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Structured state repository."
            value={description}
          />
          <p className="mt-1 text-right text-[11px] tabular-nums text-[var(--text-tertiary)]">
            {description.length}/{DESCRIPTION_LIMIT}
          </p>
        </SettingsField>

        {error ? (
          <p
            className="rounded-lg bg-[var(--status-error)]/10 px-3 py-2 text-xs text-[var(--status-error)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-[var(--stroke-divider)] pt-4">
          <Button
            disabled={!dirty || saving}
            onClick={() => {
              setName(project.name);
              setDescription(savedDescription);
              setError(null);
            }}
            type="button"
            variant="outline"
          >
            Discard
          </Button>
          <Button disabled={!dirty || saving || !trimmedName} type="submit" variant="commit">
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <div className="mt-6 grid gap-5 border-t border-[var(--stroke-divider)] pt-5">
        <SettingsField hint="Use with the CLI, MCP and API. Never changes." label="Project ID">
          <CopyValue label="project ID" value={project.project_id} />
        </SettingsField>
        <SettingsField hint="Keeps working after a rename." label="Stable link">
          <CopyValue label="stable link" value={stableLink} />
        </SettingsField>
        <SettingsField label="Created">
          <p className="pt-2 text-[13px] text-[var(--text-secondary)]">
            {new Date(project.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </SettingsField>
        <SettingsField hint="What lives in this repository today." label="Contents">
          <RepositoryStats project={project} />
        </SettingsField>
      </div>
    </SettingsSection>
  );
}
