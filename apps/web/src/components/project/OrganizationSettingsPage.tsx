'use client';

import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Building2,
  GitBranch,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface OrganizationSettingsPageProps {
  ownerSlug: string;
}

function SettingsCard({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)]">
      <div className="border-b border-[var(--stroke-divider)] px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--hover-bg)] text-[var(--text-secondary)]">
            <Icon aria-hidden="true" className="size-4" />
          </span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SharedSetupLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs font-semibold text-[var(--accent-commit)] transition-colors hover:bg-[var(--hover-bg)]"
    >
      {label}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

export function OrganizationSettingsPage({ ownerSlug }: OrganizationSettingsPageProps) {
  const initialProfile = useMemo(
    () => ({
      description: 'Organization namespace for structured state repositories.',
      displayName: ownerSlug,
      slug: ownerSlug,
    }),
    [ownerSlug]
  );
  const [profile, setProfile] = useState(initialProfile);
  const [repoVisibility, setRepoVisibility] = useState('local');
  const [repoTemplate, setRepoTemplate] = useState('structured-state');
  const profileDirty =
    profile.displayName !== initialProfile.displayName ||
    profile.slug !== initialProfile.slug ||
    profile.description !== initialProfile.description;
  const repoDefaultsDirty = repoVisibility !== 'local' || repoTemplate !== 'structured-state';

  return (
    <div className="min-h-screen bg-[var(--surface-app)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-6 py-4">
          <Link
            href={`/${ownerSlug}`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to organization
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 py-8">
        <section className="grid gap-6 border-b border-[var(--stroke-divider)] pb-7 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 gap-5">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-[var(--radius-panel)] bg-[var(--text-primary)] text-2xl font-bold text-[var(--surface-card)]">
              T3
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Owner namespace
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                {ownerSlug} settings
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                Organization settings control the namespace that owns repositories. They define how
                repos are created and who can work across the owner scope.
              </p>
            </div>
          </div>

          <dl className="grid h-fit grid-cols-2 gap-2 rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-3 text-xs">
            <div className="rounded-[var(--radius-control)] bg-[var(--hover-bg)] px-3 py-2">
              <dt className="font-medium text-[var(--text-tertiary)]">Repositories</dt>
              <dd className="mt-1 font-semibold text-[var(--text-primary)]">owner scoped</dd>
            </div>
            <div className="rounded-[var(--radius-control)] bg-[var(--hover-bg)] px-3 py-2">
              <dt className="font-medium text-[var(--text-tertiary)]">Auth mode</dt>
              <dd className="mt-1 font-semibold text-[var(--text-primary)]">local</dd>
            </div>
          </dl>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SettingsCard
            description="Edit how this organization appears in owner/repo paths."
            icon={Building2}
            title="Organization profile"
          >
            <div className="grid gap-4 p-5">
              <label className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                Organization display name
                <Input
                  value={profile.displayName}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, displayName: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                Organization slug
                <Input
                  value={profile.slug}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, slug: event.target.value }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                Organization description
                <Textarea
                  value={profile.description}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                />
              </label>
              <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--stroke-divider)] pt-4">
                <Button
                  disabled={!profileDirty}
                  onClick={() => setProfile(initialProfile)}
                  type="button"
                  variant="canvas-outline"
                >
                  Reset profile form
                </Button>
                <Button disabled={!profileDirty} type="button">
                  Save organization profile
                </Button>
              </div>
            </div>
          </SettingsCard>

          <div className="grid gap-4">
            <SettingsCard
              description="Defaults applied when someone creates a new repo inside this org."
              icon={GitBranch}
              title="Repository creation defaults"
            >
              <div className="grid gap-4 p-5">
                <label className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  Default repository visibility
                  <select
                    className="h-10 rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30"
                    value={repoVisibility}
                    onChange={(event) => setRepoVisibility(event.target.value)}
                  >
                    <option value="local">Local only</option>
                    <option value="private">Private when cloud auth is available</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                  Default repository template
                  <select
                    className="h-10 rounded-[var(--radius-control)] border border-[var(--stroke-default)] bg-[var(--surface-card)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--stroke-strong)] focus:ring-2 focus:ring-[var(--ring)]/30"
                    value={repoTemplate}
                    onChange={(event) => setRepoTemplate(event.target.value)}
                  >
                    <option value="structured-state">Structured state repository</option>
                    <option value="prd-review">PRD review repository</option>
                    <option value="empty">Empty repository</option>
                  </select>
                </label>
                <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--stroke-divider)] pt-4">
                  <Button
                    disabled={!repoDefaultsDirty}
                    onClick={() => {
                      setRepoVisibility('local');
                      setRepoTemplate('structured-state');
                    }}
                    type="button"
                    variant="canvas-outline"
                  >
                    Reset repository defaults
                  </Button>
                  <Button disabled={!repoDefaultsDirty} type="button">
                    Save repository defaults
                  </Button>
                </div>
              </div>
            </SettingsCard>

            <SettingsCard
              description="Local identity is available now; org member controls belong here once cloud auth lands."
              icon={Users}
              title="Members and access"
            >
              <div className="space-y-4 p-5">
                <div className="rounded-[var(--radius-control)] bg-[var(--hover-bg)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)]">
                  Member management requires cloud auth.
                </div>
                <Button disabled type="button" variant="canvas-outline">
                  Invite member
                </Button>
              </div>
            </SettingsCard>
          </div>
        </div>

        <section className="mt-5 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Settings aria-hidden="true" className="size-4 text-[var(--text-secondary)]" />
              Shared local setup
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Provider credentials and T3X API keys are local workspace setup, not org policy.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SharedSetupLink href="/settings/providers" label="Open provider setup" />
            <SharedSetupLink href="/settings/access" label="Open API / CLI / MCP access" />
          </div>
        </section>

        <section className="mt-5 grid gap-4 text-xs text-[var(--text-secondary)] md:grid-cols-3">
          <div className="flex items-start gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 text-[var(--text-tertiary)]" />
            Org setup decides namespace policy.
          </div>
          <div className="flex items-start gap-2">
            <SlidersHorizontal
              aria-hidden="true"
              className="mt-0.5 size-4 text-[var(--text-tertiary)]"
            />
            Repo setup decides workflow behavior.
          </div>
          <div className="flex items-start gap-2">
            <Blocks aria-hidden="true" className="mt-0.5 size-4 text-[var(--text-tertiary)]" />
            Global setup decides local credentials.
          </div>
        </section>
      </main>
    </div>
  );
}
