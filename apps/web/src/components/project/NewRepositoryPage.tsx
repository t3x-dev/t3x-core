'use client';

import { Database, FileText, Lock, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_OWNER_SLUG, getProjectRepoPath, toRepoSlug } from '@/domain/project/repoPath';
import { useProjectCrud } from '@/hooks/projects/useProjectCrud';
import { cn } from '@/utils/cn';

type SetupMode = 'blank' | 'source';

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function SetupChoice({
  checked,
  description,
  icon,
  label,
  onChange,
  value,
}: {
  checked: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  onChange: (value: SetupMode) => void;
  value: SetupMode;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border bg-[var(--surface-card)] p-4 transition-colors',
        checked
          ? 'border-[var(--accent-commit)] bg-[var(--accent-commit-soft)]'
          : 'border-[var(--stroke-default)] hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)]'
      )}
    >
      <input
        checked={checked}
        className="mt-1 size-4 accent-[var(--accent-commit)]"
        name="repository-setup"
        onChange={() => onChange(value)}
        type="radio"
      />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-panel)] text-[var(--text-secondary)]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--text-primary)]">{label}</span>
        <span className="mt-1 block text-sm leading-snug text-[var(--text-secondary)]">
          {description}
        </span>
      </span>
    </label>
  );
}

export function NewRepositoryPage() {
  const params = useParams<{ owner?: string | string[] }>();
  const ownerSlug = firstParam(params.owner).toLowerCase() || DEFAULT_OWNER_SLUG;
  const router = useRouter();
  const { add: createRepository } = useProjectCrud();
  const [repoName, setRepoName] = useState('');
  const [description, setDescription] = useState('');
  const [setupMode, setSetupMode] = useState<SetupMode>('blank');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const normalizedName = repoName.trim();
  const previewSlug = toRepoSlug(normalizedName || 'New repository');
  const previewPath = `/${ownerSlug}/${previewSlug}`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedName || creating) return;

    setCreating(true);
    setCreateError(null);
    try {
      const project = await createRepository(normalizedName, {
        description: description.trim() || 'Structured state repository.',
      });
      const repoPath = getProjectRepoPath(project);
      router.push(setupMode === 'source' ? `${repoPath}/workspaces` : repoPath);
    } catch {
      setCreateError('Failed to create repository');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
        <div className="flex h-16 items-center gap-3 px-6">
          <Link
            aria-label={`Back to ${ownerSlug}`}
            className="flex items-center gap-3 rounded-[var(--radius-control)] pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50"
            href={`/${ownerSlug}`}
          >
            <span className="flex size-9 items-center justify-center rounded-[var(--radius-control)] bg-[var(--text-primary)] text-sm font-bold text-[var(--surface-card)]">
              T3
            </span>
            <span className="text-base font-bold text-[var(--text-primary)]">{ownerSlug}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-6 py-10">
        <div className="border-b border-[var(--stroke-divider)] pb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <Link className="text-[var(--accent-commit)] hover:underline" href={`/${ownerSlug}`}>
              {ownerSlug}
            </Link>
            <span>/</span>
            <span>New repository</span>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-normal text-[var(--text-primary)]">
            Create a new repository
          </h1>
        </div>

        <form className="grid gap-8 py-8" onSubmit={handleSubmit}>
          <section className="grid gap-4 border-b border-[var(--stroke-divider)] pb-8">
            <div className="grid gap-4 md:grid-cols-[minmax(180px,240px)_minmax(0,1fr)]">
              <div className="grid gap-2">
                <label
                  className="text-sm font-bold text-[var(--text-primary)]"
                  htmlFor="new-repository-owner"
                >
                  Owner
                </label>
                <Input id="new-repository-owner" readOnly value={ownerSlug} />
              </div>
              <div className="grid gap-2">
                <label
                  className="text-sm font-bold text-[var(--text-primary)]"
                  htmlFor="new-repository-name"
                >
                  Repository name
                </label>
                <Input
                  autoFocus
                  disabled={creating}
                  id="new-repository-name"
                  onChange={(event) => {
                    setRepoName(event.target.value);
                    if (createError) setCreateError(null);
                  }}
                  placeholder="new-repository"
                  value={repoName}
                />
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4">
              <div className="text-xs font-bold uppercase text-[var(--text-tertiary)]">
                Path preview
              </div>
              <div className="mt-2 break-all font-mono text-sm font-semibold text-[var(--text-primary)]">
                {previewPath}
              </div>
            </div>

            <div className="grid gap-2">
              <label
                className="text-sm font-bold text-[var(--text-primary)]"
                htmlFor="new-repository-description"
              >
                Description
              </label>
              <Textarea
                disabled={creating}
                id="new-repository-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Structured state workflow."
                value={description}
              />
            </div>
          </section>

          <section className="grid gap-3 border-b border-[var(--stroke-divider)] pb-8">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Repository setup</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <SetupChoice
                checked={setupMode === 'blank'}
                description="Create the repository shell and start on the State tab."
                icon={<Database className="size-4" />}
                label="Blank repository"
                onChange={setSetupMode}
                value="blank"
              />
              <SetupChoice
                checked={setupMode === 'source'}
                description="Create the repository and open the source-evidence workspace."
                icon={<FileText className="size-4" />}
                label="Start from source evidence"
                onChange={setSetupMode}
                value="source"
              />
            </div>
          </section>

          <section className="grid gap-3 border-b border-[var(--stroke-divider)] pb-8">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Visibility</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-[var(--stroke-default)] bg-[var(--surface-card)] p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  <Lock className="size-4 text-[var(--text-secondary)]" />
                  Local repository
                </div>
                <p className="mt-2 text-sm leading-snug text-[var(--text-secondary)]">
                  Private by default
                </p>
              </div>
              <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--stroke-default)] bg-[var(--surface-panel)] p-4 text-sm text-[var(--text-secondary)]">
                <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                  <Sparkles className="size-4 text-[var(--accent-pending)]" />
                  Organization policy
                </div>
                <p className="mt-2 leading-snug">Managed by {ownerSlug} settings.</p>
              </div>
            </div>
          </section>

          {createError && (
            <p className="text-sm font-semibold text-[var(--status-error)]">{createError}</p>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Button asChild variant="outline">
              <Link href={`/${ownerSlug}`}>Cancel</Link>
            </Button>
            <Button disabled={!normalizedName || creating} type="submit" variant="commit">
              <Plus className="size-4" />
              {creating ? 'Creating...' : 'Create repository'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
