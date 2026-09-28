'use client';

import { ArrowLeft, ArrowRight, Building2, KeyRound, Settings, Users } from 'lucide-react';
import Link from 'next/link';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { withReturnTo } from '@/utils/navigationReturn';

export function OrganizationSettingsPage({ ownerSlug }: { ownerSlug: string }) {
  const { accounts, error, isLoading } = useNamespaceAccounts();
  const namespace = accounts.find((account) => account.namespace.slug === ownerSlug)?.namespace;
  const returnTo = `/${encodeURIComponent(ownerSlug)}/settings`;

  return (
    <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
        <div className="mx-auto max-w-[1180px] px-6 py-4">
          <Link
            className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]"
            href={`/${encodeURIComponent(ownerSlug)}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Back to namespace
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1180px] space-y-5 px-6 py-8">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
            Owner namespace
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{ownerSlug} settings</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Namespace identity is read from your account. Editing organization policy is not
            supported here yet.
          </p>
        </div>
        {isLoading ? <output>Loading namespace…</output> : null}
        {error ? <p role="alert">Could not load namespace details.</p> : null}
        {!isLoading && !error && !namespace ? (
          <p role="alert">This namespace is not available to your account.</p>
        ) : null}
        {namespace ? (
          <section
            className="rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5"
            aria-label="Namespace identity"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 aria-hidden="true" className="size-4" /> Namespace identity
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--text-tertiary)]">Display name</dt>
                <dd className="font-medium">{namespace.display_name}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-tertiary)]">Slug</dt>
                <dd className="font-mono">{namespace.slug}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-tertiary)]">Kind</dt>
                <dd>{namespace.kind}</dd>
              </div>
            </dl>
          </section>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Users aria-hidden="true" className="size-4" /> Members and access
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Manage members through the existing namespace access page.
            </p>
            <Link
              className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--accent-commit)]"
              href={withReturnTo('/settings/members', returnTo)}
            >
              Open members <ArrowRight className="size-4" />
            </Link>
          </section>
          <section className="rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Settings aria-hidden="true" className="size-4" /> Repository defaults
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Organization-wide default visibility and templates cannot be saved with the current
              API.
            </p>
            <Link
              className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--accent-commit)]"
              href={`/${encodeURIComponent(ownerSlug)}/new`}
            >
              Create a repository <ArrowRight className="size-4" />
            </Link>
          </section>
        </div>
        <section className="rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound aria-hidden="true" className="size-4" /> Shared setup
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Personal provider credentials and API tokens are separate from organization policy.
          </p>
          <div className="mt-3 flex flex-wrap gap-5 text-sm text-[var(--accent-commit)]">
            <Link href={withReturnTo('/settings/provider-credentials', returnTo)}>
              Open provider credentials
            </Link>
            <Link href={withReturnTo('/settings/access', returnTo)}>Open API tokens</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
