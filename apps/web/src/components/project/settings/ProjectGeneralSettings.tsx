'use client';

import {
  Check,
  ChevronRight,
  Copy,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  Pencil,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatUserFacingError } from '@/domain/format/errors';
import { getProjectIdRepoPath, toRepoSlug } from '@/domain/project/repoPath';
import { projectDescription } from '@/hooks/projects/useProjectSettings';
import type { ProjectDetail } from '@/types/api';
import styles from './ProjectGeneralSettings.module.css';
import { SettingsField } from './SettingsSection';

const DESCRIPTION_LIMIT = 280;

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.copyField}>
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
    {
      icon: GitCommitHorizontal,
      label: 'Commits',
      value: project.commits_count ?? project.stats?.commits_count ?? 0,
    },
    { icon: GitBranch, label: 'Branches', value: project.branches_count ?? 0 },
    { icon: Pencil, label: 'Drafts', value: project.drafts_count ?? 0 },
    { icon: FileText, label: 'Outputs', value: project.outputs_count ?? 0 },
  ];
  return (
    <dl className={styles.stats}>
      {stats.map(({ icon: Icon, label, value }) => (
        <div key={label} data-kind={label}>
          <span className={styles.statIcon}>
            <Icon aria-hidden="true" size={16} />
          </span>
          <dd>{value}</dd>
          <dt>{label}</dt>
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
    <section className={styles.general} id="general" aria-labelledby="general-heading">
      <div className={styles.breadcrumb}>
        Settings <ChevronRight size={12} aria-hidden="true" /> General
      </div>
      <h1 id="general-heading">General</h1>
      <p className={styles.lead}>
        Name and describe this project, and find the identifiers other tools use to reach it.
      </p>
      <form className={styles.details} onSubmit={handleSubmit}>
        <h2>Project details</h2>
        <SettingsField
          hint="Shown in the header and in links."
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
          hint="A short summary for people visiting the project."
          htmlFor="settings-repo-description"
          label="Description"
        >
          <div className={styles.descriptionField}>
            <Textarea
              className="min-h-[76px] resize-y"
              disabled={saving}
              id="settings-repo-description"
              maxLength={DESCRIPTION_LIMIT}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a description"
              value={description}
            />
            <p className="mt-1 text-right text-[11px] tabular-nums text-[var(--text-tertiary)]">
              {description.length} / {DESCRIPTION_LIMIT}
            </p>
          </div>
        </SettingsField>

        {error ? (
          <p
            className="rounded-lg bg-[var(--status-error)]/10 px-3 py-2 text-xs text-[var(--status-error)]"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          {dirty ? <span className={styles.unsaved}>You have unsaved changes</span> : null}
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

      <div className={styles.identifiers}>
        <h2>Identifiers</h2>
        <SettingsField hint="Stable and read-only." label="Project ID">
          <CopyValue label="project ID" value={project.project_id} />
        </SettingsField>
        <SettingsField hint="Keeps working if the project is renamed." label="Stable link">
          <CopyValue label="stable link" value={stableLink} />
        </SettingsField>
      </div>
      <div className={styles.contents}>
        <h2>Contents</h2>
        <p>What this project currently holds.</p>
        <RepositoryStats project={project} />
      </div>
    </section>
  );
}
