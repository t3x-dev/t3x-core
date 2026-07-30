import {
  ExternalLink,
  FileCheck2,
  Link2,
  MessageCircle,
  PanelTop,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type CommunityNoteStatus = 'ready' | 'needs_followup' | 'blocked';
type CommunityLinkType = 'workspace' | 'output' | 'review';

interface CommunityHandoffNote {
  id: string;
  title: string;
  author: string;
  role: string;
  status: CommunityNoteStatus;
  linkedLabel: string;
  linkedType: CommunityLinkType;
  summary: string;
  updatedAt: string;
  actionLabel: string;
}

interface ProjectCollaborator {
  id: string;
  name: string;
  role: string;
  responsibility: string;
}

interface ExternalContextLink {
  id: string;
  label: string;
  target: string;
  summary: string;
}

const HANDOFF_NOTES: CommunityHandoffNote[] = [
  {
    id: 'community_prd_handoff',
    title: 'PRD audience handoff',
    author: 'Maya Chen',
    role: 'Product reviewer',
    status: 'ready',
    linkedLabel: 'Workspace: PRD audience handoff',
    linkedType: 'workspace',
    summary:
      'Product and engineering reviewers need to confirm the audience wording before YOps apply.',
    updatedAt: 'Updated 2h ago',
    actionLabel: 'Open workspace',
  },
  {
    id: 'community_launch_notes',
    title: 'Release note cleanup',
    author: 'Noah Park',
    role: 'Release owner',
    status: 'needs_followup',
    linkedLabel: 'Output: Launch notes summary',
    linkedType: 'output',
    summary: 'Stale output needs regeneration from the latest committed release-note state.',
    updatedAt: 'Updated yesterday',
    actionLabel: 'Open output',
  },
  {
    id: 'community_schema_rollout',
    title: 'PRD Schema v3 rollout',
    author: 'Iris Zhang',
    role: 'Schema owner',
    status: 'blocked',
    linkedLabel: 'Review: PRD Schema v3 rollout',
    linkedType: 'review',
    summary: 'Migration detail is still needed for 3 existing nodes before schema promotion.',
    updatedAt: 'Updated 2d ago',
    actionLabel: 'Open review',
  },
];

const COLLABORATORS: ProjectCollaborator[] = [
  {
    id: 'collab_product',
    name: 'Maya Chen',
    role: 'Product reviewer',
    responsibility: 'Audience wording and PRD handoff acceptance.',
  },
  {
    id: 'collab_schema',
    name: 'Iris Zhang',
    role: 'Schema owner',
    responsibility: 'Schema migration notes and default schema promotion.',
  },
  {
    id: 'collab_release',
    name: 'Noah Park',
    role: 'Release owner',
    responsibility: 'Launch-note output readiness and external share timing.',
  },
];

const EXTERNAL_CONTEXT_LINKS: ExternalContextLink[] = [
  {
    id: 'context_discord',
    label: 'Discord thread',
    target: '#prd-audience-handoff',
    summary: 'Human discussion for reviewer wording; not source evidence until imported.',
  },
  {
    id: 'context_linear',
    label: 'Linear issue',
    target: 'T3X-1183',
    summary: 'Tracks UI rollout coordination and remaining review/output polish.',
  },
];

const STATUS_BADGES: Record<CommunityNoteStatus, 'success' | 'pending' | 'warning'> = {
  ready: 'success',
  needs_followup: 'pending',
  blocked: 'warning',
};

const STATUS_LABELS: Record<CommunityNoteStatus, string> = {
  ready: 'Ready',
  needs_followup: 'Needs follow-up',
  blocked: 'Blocked',
};

const LINK_TYPE_ICONS: Record<CommunityLinkType, ComponentType<{ className?: string }>> = {
  output: PanelTop,
  review: ShieldAlert,
  workspace: FileCheck2,
};

export function ProjectCommunityTab() {
  return (
    <section className="h-full overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <MessageCircle
              aria-hidden="true"
              className="h-4 w-4 text-[var(--accent-conversation)]"
            />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Project community</h2>
          </div>
          <p className="text-sm leading-5 text-[var(--text-secondary)]">
            Human handoff notes, collaborators, and external context stay linked to project objects
            without entering deterministic mutation paths.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section
            aria-label="Handoff notes"
            className="min-w-0 overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--stroke-divider)] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Handoff notes</h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Discussion that references state, reviews, and outputs but does not mutate them.
                </p>
              </div>
              <Badge variant="conversation">{HANDOFF_NOTES.length} notes</Badge>
            </div>

            <div className="divide-y divide-[var(--stroke-divider)]">
              {HANDOFF_NOTES.map((note) => (
                <HandoffNoteRow key={note.id} note={note} />
              ))}
            </div>
          </section>

          <aside className="grid content-start gap-3">
            <CollaboratorsPanel />
            <ExternalContextPanel />
          </aside>
        </div>
      </div>
    </section>
  );
}

function HandoffNoteRow({ note }: { note: CommunityHandoffNote }) {
  const LinkedIcon = LINK_TYPE_ICONS[note.linkedType];

  return (
    <article className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_150px] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {note.title}
          </h4>
          <Badge variant={STATUS_BADGES[note.status]}>{STATUS_LABELS[note.status]}</Badge>
        </div>

        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{note.summary}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{note.author}</span>
          <span>{note.role}</span>
          <span aria-hidden="true">/</span>
          <span>{note.updatedAt}</span>
        </div>

        <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
          <LinkedIcon aria-hidden="true" className="h-3.5 w-3.5 text-[var(--accent-branch)]" />
          <span className="truncate">{note.linkedLabel}</span>
        </div>
      </div>

      <Button
        aria-label={`${note.actionLabel}: ${note.title}`}
        className="w-full lg:w-auto"
        size="sm"
        type="button"
        variant="canvas-outline"
      >
        <Link2 aria-hidden="true" className="h-4 w-4" />
        {note.actionLabel}
      </Button>
    </article>
  );
}

function CollaboratorsPanel() {
  return (
    <section className="overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <div className="flex items-center gap-2 border-b border-[var(--stroke-divider)] px-3 py-3">
        <Users aria-hidden="true" className="h-4 w-4 text-[var(--accent-conversation)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Project collaborators</h3>
      </div>
      <div className="divide-y divide-[var(--stroke-divider)]">
        {COLLABORATORS.map((collaborator) => (
          <div className="px-3 py-3" key={collaborator.id}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {collaborator.name}
              </p>
              <Badge variant="outline">{collaborator.role}</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
              {collaborator.responsibility}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExternalContextPanel() {
  return (
    <section className="overflow-hidden rounded-md border border-[var(--stroke-divider)] bg-[var(--surface-panel)]">
      <div className="flex items-center gap-2 border-b border-[var(--stroke-divider)] px-3 py-3">
        <ExternalLink aria-hidden="true" className="h-4 w-4 text-[var(--text-secondary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">External context</h3>
      </div>
      <div className="divide-y divide-[var(--stroke-divider)]">
        {EXTERNAL_CONTEXT_LINKS.map((link) => (
          <div className="px-3 py-3" key={link.id}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {link.label}
              </p>
              <span className="truncate font-mono text-xs text-[var(--text-tertiary)]">
                {link.target}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{link.summary}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
