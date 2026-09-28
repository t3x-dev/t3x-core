'use client';

import {
  Bot,
  Eye,
  Info,
  type LucideIcon,
  PackageOpen,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

export const PROJECT_SETTINGS_GROUPS: Array<{
  label: string;
  items: Array<{ icon: LucideIcon; id: string; label: string }>;
}> = [
  {
    label: 'Repository',
    items: [
      { id: 'general', label: 'General', icon: Info },
      { id: 'visibility', label: 'Visibility', icon: Eye },
      { id: 'access', label: 'Access', icon: Users },
    ],
  },
  {
    label: 'Automation',
    items: [
      { id: 'ai', label: 'AI defaults', icon: Sparkles },
      { id: 'autopilot', label: 'Autopilot', icon: Bot },
    ],
  },
  {
    label: 'Trust & data',
    items: [
      { id: 'integrity', label: 'Integrity', icon: ShieldCheck },
      { id: 'export', label: 'Export', icon: PackageOpen },
    ],
  },
  {
    label: '',
    items: [{ id: 'danger', label: 'Danger zone', icon: TriangleAlert }],
  },
];

const SECTION_IDS = PROJECT_SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id));

function usePresentSections(): Set<string> {
  const [present, setPresent] = useState(() => new Set(SECTION_IDS));
  useEffect(() => {
    const sync = () => {
      const next = SECTION_IDS.filter((id) => document.getElementById(id));
      setPresent((prev) =>
        prev.size === next.length && next.every((id) => prev.has(id)) ? prev : new Set(next)
      );
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return present;
}

function useActiveSection(present: Set<string>): string {
  const [active, setActive] = useState(SECTION_IDS[0]);
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const ids = SECTION_IDS.filter((id) => present.has(id));
        const line = window.innerHeight * 0.3;
        let current = ids[0];
        for (const id of ids) {
          const top = document.getElementById(id)?.getBoundingClientRect().top;
          if (top !== undefined && top <= line) current = id;
        }
        if (current) setActive(current);
      });
    };
    sync();
    // Settings scroll inside the project shell, so listen in the capture phase.
    document.addEventListener('scroll', sync, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', sync, { capture: true });
    };
  }, [present]);
  return active;
}

export function ProjectSettingsNav() {
  const present = usePresentSections();
  const active = useActiveSection(present);
  const groups = PROJECT_SETTINGS_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => present.has(item.id)),
  })).filter((group) => group.items.length > 0);
  return (
    <nav aria-label="Settings sections" className="grid gap-5">
      {groups.map((group) => (
        <div className="grid gap-0.5" key={group.label || 'danger'}>
          {group.label ? (
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
              {group.label}
            </p>
          ) : (
            <div className="mb-2 border-t border-[var(--stroke-divider)]" />
          )}
          {group.items.map(({ icon: Icon, id, label }) => {
            const selected = active === id;
            const danger = id === 'danger';
            return (
              <a
                aria-current={selected ? 'true' : undefined}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-[var(--radius-md)] px-3 text-[13px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/50',
                  selected
                    ? danger
                      ? 'bg-[var(--status-error)]/10 font-semibold text-[var(--status-error)]'
                      : 'bg-[var(--accent-commit-soft)] font-semibold text-[var(--accent-commit)]'
                    : danger
                      ? 'text-[var(--status-error)] hover:bg-[var(--status-error)]/8'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                )}
                href={`#${id}`}
                key={id}
                onClick={(event) => {
                  const target = document.getElementById(id);
                  if (!target) return;
                  event.preventDefault();
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.history.replaceState(null, '', `#${id}`);
                }}
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                {label}
              </a>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
