'use client';

import { FileText, Loader2, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatUserFacingError } from '@/domain/format/errors';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useCreatePrdStarter } from '@/hooks/projects/useCreatePrdStarter';

export function PrdStarterCard() {
  const router = useRouter();
  const create = useCreatePrdStarter();
  const { activeAccount, isLoading, error: accountError } = useNamespaceAccounts();
  const [name, setName] = useState('My product brief');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const nameId = useId();
  const errorId = useId();
  const localMode = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const canCreate =
    localMode ||
    (!isLoading &&
      !accountError &&
      activeAccount?.authorized_actions.includes('project:create') === true);
  const destination = localMode ? 'your local workspace' : activeAccount?.namespace.display_name;

  return (
    <section
      aria-labelledby={`${nameId}-heading`}
      className="mb-8 rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-base)] p-5"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <FileText className="h-4 w-4" aria-hidden="true" /> Project starter · No AI required
          </div>
          <h2 id={`${nameId}-heading`} className="text-lg font-semibold">
            Product requirements brief
          </h2>
          <p className="max-w-xl text-sm text-[var(--text-secondary)]">
            Start with a structured problem, audience, outcome, and requirements. Edit the draft,
            review changes, and keep a verifiable project history.
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            This starter needs your input; it is not a validated specification.
          </p>
        </div>
        <form
          className="w-full space-y-3 md:max-w-xs"
          onSubmit={async (event) => {
            event.preventDefault();
            if (inFlight.current || !canCreate || !name.trim()) return;
            inFlight.current = true;
            setBusy(true);
            setError(null);
            try {
              const project = await create(
                name.trim(),
                localMode ? undefined : activeAccount!.namespace.slug
              );
              router.push(`/project/${encodeURIComponent(project.project_id)}?tab=state`);
            } catch (cause) {
              setError(formatUserFacingError(cause, 'Could not create your private project.'));
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          <Label htmlFor={nameId}>Project name</Label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={255}
            disabled={busy}
            aria-describedby={error ? errorId : undefined}
          />
          <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Private{destination ? ` · ${destination}` : ''} · No AI credits used
          </p>
          {!canCreate && (
            <p className="text-xs text-[var(--text-secondary)]">
              {isLoading
                ? 'Loading your workspace…'
                : 'Select a workspace where you can create projects.'}
            </p>
          )}
          {error && (
            <p id={errorId} role="alert" className="text-sm text-[var(--status-error)]">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={!canCreate || busy || !name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Creating private project…' : 'Start a private PRD'}
          </Button>
        </form>
      </div>
    </section>
  );
}
