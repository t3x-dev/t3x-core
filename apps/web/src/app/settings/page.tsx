import { ArrowRight, Blocks, GitBranch, KeyRound, SlidersHorizontal, Webhook } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-8 py-8">
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          Settings
        </p>
        <h1 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Overview</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Choose a settings area. Runtime-dependent checks are shown inside the pages that can
          verify them.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <EntryCard
          href="/settings/providers"
          icon={Blocks}
          label="AI Providers"
          title="Model providers"
          detail="Configure model, extraction, and generation credentials."
          meta="Global setting"
          action="Configure"
        />
        <EntryCard
          href="/settings/access"
          icon={KeyRound}
          label="API Access"
          title="Connection and keys"
          detail="Configure the local API URL and key used by WebUI, CLI, and MCP."
          meta="May use env override"
          action="Configure"
        />
        <EntryCard
          href="/settings/preferences"
          icon={SlidersHorizontal}
          label="Workspace Defaults"
          title="Local preferences"
          detail="Open density, default view, profile, and developer mode."
          meta="Local"
          action="Open"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)]">
          <div className="border-b border-[var(--stroke-divider)] px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Automation</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Automation depends on the backend runtime; these entries open setup and saved rules
              when available.
            </p>
          </div>
          <div className="grid gap-0 divide-y divide-[var(--stroke-divider)]">
            <OverviewLink
              href="/settings/webhooks"
              icon={Webhook}
              title="Webhooks"
              detail="Send commit, leaf, and workflow events to external systems."
              status="Requires backend runtime"
            />
            <OverviewLink
              href="/settings/recipes"
              icon={Blocks}
              title="Recipes"
              detail="Package repeatable project setup patterns for future workspaces."
              status="Requires backend runtime"
            />
          </div>
        </div>

        <aside className="rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-[var(--accent-branch)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Resolution order</h2>
          </div>
          <ol className="mt-4 space-y-3 text-xs text-[var(--text-secondary)]">
            <ResolutionStep label="Conversation" detail="Immediate chat and extraction context." />
            <ResolutionStep
              label="Project"
              detail="Workflow-specific overrides and output rules."
            />
            <ResolutionStep
              label="Account"
              detail="Your workspace defaults from this Settings area."
            />
            <ResolutionStep
              label="Global"
              detail="System defaults used when nothing else is set."
            />
          </ol>
          <p className="mt-5 rounded-xl bg-[var(--hover-bg)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
            Project overrides stay in each project because they need project context.
          </p>
        </aside>
      </section>
    </div>
  );
}

interface OverviewLinkProps {
  href: string;
  icon: typeof Blocks;
  title: string;
  detail: string;
  status?: string;
}

function OverviewLink({ href, icon: Icon, title, detail, status }: OverviewLinkProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--hover-bg)]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-secondary)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
          {detail}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {status && (
          <span className="rounded-full bg-[var(--hover-bg)] px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)]">
            {status}
          </span>
        )}
        <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function ResolutionStep({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <span className="font-semibold text-[var(--text-primary)]">{label}</span>
      <span className="leading-5">{detail}</span>
    </li>
  );
}

interface EntryCardProps {
  href: string;
  icon: typeof Blocks;
  label: string;
  title: string;
  detail: string;
  meta: string;
  action: string;
}

function EntryCard({ href, icon: Icon, label, title, detail, meta, action }: EntryCardProps) {
  return (
    <Link
      href={href}
      aria-label={`${label} ${action}`}
      className="group rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-4 transition-colors hover:bg-[var(--hover-bg)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          {label}
        </span>
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
      </div>
      <div className="mt-4 text-sm font-semibold text-[var(--text-primary)]">{title}</div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{detail}</p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--stroke-divider)] pt-3">
        <span className="text-[11px] text-[var(--text-tertiary)]">{meta}</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-commit)]">
          {action}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
