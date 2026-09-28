'use client';

import {
  Box,
  ChevronUp,
  Circle,
  HelpCircle,
  KeyRound,
  LogOut,
  PanelLeft,
  Settings,
  User,
  Users,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ProjectRouteShell } from '@/components/project/ProjectRouteShell';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useSession } from '@/hooks/shared/useSession';
import styles from './SettingsLayout.module.css';

interface SettingsNavItem {
  href: string;
  label: string;
  icon: typeof User;
  activePaths: string[];
}

const PERSONAL_NAV: SettingsNavItem[] = [
  { href: '/settings/profile', label: 'Profile', icon: User, activePaths: ['/settings/profile'] },
  {
    href: '/settings/preferences',
    label: 'Appearance',
    icon: Settings,
    activePaths: ['/settings/preferences'],
  },
  {
    href: '/settings/providers',
    label: 'My default model',
    icon: Box,
    activePaths: ['/settings/providers'],
  },
  {
    href: '/settings/provider-credentials',
    label: 'Provider credentials',
    icon: KeyRound,
    activePaths: ['/settings/provider-credentials'],
  },
  { href: '/settings/help', label: 'Help', icon: HelpCircle, activePaths: ['/settings/help'] },
];

const ORGANIZATION_NAV: SettingsNavItem[] = [
  { href: '/settings', label: 'General', icon: Settings, activePaths: ['/settings'] },
  {
    href: '/settings/members',
    label: 'Members',
    icon: Users,
    activePaths: ['/settings/members'],
  },
  {
    href: '/settings/model-access',
    label: 'Model access',
    icon: Box,
    activePaths: ['/settings/model-access'],
  },
  {
    href: '/settings/api-tokens',
    label: 'API tokens',
    icon: KeyRound,
    activePaths: ['/settings/api-tokens', '/settings/access'],
  },
  {
    href: '/settings/usage',
    label: 'Usage',
    icon: PanelLeft,
    activePaths: ['/settings/usage'],
  },
];

const AUTOMATION_NAV: SettingsNavItem[] = [
  {
    href: '/settings/webhooks',
    label: 'Webhooks',
    icon: Circle,
    activePaths: ['/settings/webhooks'],
  },
  {
    href: '/settings/recipes',
    label: 'Recipes',
    icon: Circle,
    activePaths: ['/settings/recipes'],
  },
];

function withProjectContext(href: string, projectId: string): string {
  if (!projectId) return href;
  return `${href}?${new URLSearchParams({ project: projectId }).toString()}`;
}

function SettingsNavLink({
  item,
  currentPath,
  projectId,
}: {
  item: SettingsNavItem;
  currentPath: string;
  projectId: string;
}) {
  const Icon = item.icon;
  const active = item.activePaths.includes(currentPath);
  return (
    <Link
      href={withProjectContext(item.href, projectId)}
      aria-current={active ? 'page' : undefined}
      className={active ? styles.navLinkActive : styles.navLink}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={2} />
      <span>{item.label}</span>
    </Link>
  );
}

function SettingsLayoutContent({ children }: { children: React.ReactNode }) {
  const currentPath = usePathname() ?? '';
  const projectId = useSearchParams().get('project')?.trim() ?? '';
  const { clear, getKey } = useSession();
  const { activeAccount } = useNamespaceAccounts();
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);

  useEffect(() => setIsAuthEnabled(Boolean(getKey())), [getKey]);

  return (
    <ProjectRouteShell fallbackProjectName="Project" projectId={projectId}>
      <div className={styles.shell}>
        <aside className={styles.sidebar} aria-label="Settings navigation">
          <section>
            <h2 className={styles.groupTitle}>Personal</h2>
            <nav className={styles.navList}>
              {PERSONAL_NAV.map((item) => (
                <SettingsNavLink
                  key={item.label}
                  item={item}
                  currentPath={currentPath}
                  projectId={projectId}
                />
              ))}
            </nav>
          </section>

          <section>
            <h2 className={styles.groupTitle}>
              {activeAccount
                ? `${activeAccount.namespace.kind === 'organization' ? 'Organization' : 'Namespace'}: ${activeAccount.namespace.display_name}`
                : 'Organization: No active namespace'}
            </h2>
            <nav className={styles.navList}>
              {ORGANIZATION_NAV.map((item) => (
                <SettingsNavLink
                  key={item.label}
                  item={item}
                  currentPath={currentPath}
                  projectId={projectId}
                />
              ))}
            </nav>
            <div className={styles.automationSection}>
              <div className={styles.automationTitle}>
                <Zap aria-hidden="true" size={18} strokeWidth={2} />
                <span>Automations</span>
                <ChevronUp aria-hidden="true" className={styles.automationChevron} size={15} />
              </div>
              <nav className={styles.automationNav} aria-label="Automations">
                {AUTOMATION_NAV.map((item) => (
                  <SettingsNavLink
                    key={item.label}
                    item={item}
                    currentPath={currentPath}
                    projectId={projectId}
                  />
                ))}
              </nav>
            </div>
          </section>

          {isAuthEnabled ? (
            <button type="button" className={styles.signOut} onClick={() => clear()}>
              <LogOut aria-hidden="true" size={18} />
              Sign out
            </button>
          ) : null}
        </aside>
        <div className={styles.content}>{children}</div>
      </div>
    </ProjectRouteShell>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SettingsLayoutContent>{children}</SettingsLayoutContent>
    </Suspense>
  );
}
