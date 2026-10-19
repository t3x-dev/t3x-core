'use client';

import {
  Bot,
  Eye,
  GitBranch,
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
import styles from './ProjectSettingsNav.module.css';

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
      { id: 'branch-rules', label: 'Branch rules', icon: GitBranch },
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
        // The final section may be too short to reach the active line at the
        // bottom of the scroll container. Keep its navigation item selected.
        const lastId = ids.at(-1);
        const lastRect = lastId ? document.getElementById(lastId)?.getBoundingClientRect() : null;
        if (lastId && lastRect && lastRect.top > 0 && lastRect.bottom <= window.innerHeight + 1) {
          current = lastId;
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

  function navigateToSection(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    const reducedMotion =
      document.documentElement.dataset.reducedMotion === 'true' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
    window.history.replaceState(null, '', `#${id}`);
  }

  return (
    <>
      <label className={styles.mobile}>
        Settings section
        <select value={active} onChange={(event) => navigateToSection(event.target.value)}>
          {groups.map((group) => (
            <optgroup key={group.label || 'danger'} label={group.label || 'Danger zone'}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <nav aria-label="Settings sections" className={styles.desktop}>
        {groups.map((group) => (
          <div className={styles.group} key={group.label || 'danger'}>
            {group.label ? (
              <p className={styles.groupTitle}>{group.label}</p>
            ) : (
              <div className={styles.divider} />
            )}
            {group.items.map(({ icon: Icon, id, label }) => {
              const selected = active === id;
              const danger = id === 'danger';
              return (
                <a
                  aria-current={selected ? 'true' : undefined}
                  className={cn(styles.link, selected && styles.active, danger && styles.danger)}
                  href={`#${id}`}
                  key={id}
                  onClick={(event) => {
                    event.preventDefault();
                    navigateToSection(id);
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
    </>
  );
}
