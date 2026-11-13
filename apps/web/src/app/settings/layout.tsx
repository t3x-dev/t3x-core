'use client';

import {
  Box,
  Circle,
  HelpCircle,
  KeyRound,
  LogOut,
  PanelLeft,
  Settings,
  User,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useDeploymentCapabilities } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { SettingsReturnLink } from '@/components/settings/SettingsReturnLink';
import { useSettingsNamespace } from '@/hooks/settings/useSettingsNamespace';
import { useSession } from '@/hooks/shared/useSession';
import palette from '@/styles/management-palette.module.css';
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
  { href: '/settings/help', label: 'Help', icon: HelpCircle, activePaths: ['/settings/help'] },
];

const NAMESPACE_NAV: SettingsNavItem[] = [
  { href: '/settings', label: 'General', icon: Settings, activePaths: ['/settings'] },
  {
    href: '/settings/members',
    label: 'Members',
    icon: Users,
    activePaths: ['/settings/members'],
  },
];

const DEPLOYMENT_NAV: SettingsNavItem[] = [
  {
    href: '/settings/model-access',
    label: 'Model access',
    icon: Box,
    activePaths: ['/settings/model-access'],
  },
  {
    href: '/settings/provider-credentials',
    label: 'Provider credentials',
    icon: KeyRound,
    activePaths: ['/settings/provider-credentials'],
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

function withSettingsContext(href: string, context: URLSearchParams): string {
  const params = new URLSearchParams(context);
  if (!AUTOMATION_NAV.some((item) => item.href === href)) params.delete('project');
  return params.size ? `${href}?${params.toString()}` : href;
}

function SettingsNavLink({
  item,
  currentPath,
  context,
}: {
  item: SettingsNavItem;
  currentPath: string;
  context: URLSearchParams;
}) {
  const Icon = item.icon;
  const active = item.activePaths.includes(currentPath);
  return (
    <Link
      href={withSettingsContext(item.href, context)}
      draggable={item.href === '/settings/providers' ? false : undefined}
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canAdministerProviderCredentials } = useDeploymentCapabilities();
  const { account, requested, returnTo } = useSettingsNamespace();
  const context = new URLSearchParams();
  if (requested) context.set('namespace', requested);
  if (returnTo) context.set('returnTo', returnTo);
  const projectId = searchParams.get('project')?.trim();
  if (projectId && AUTOMATION_NAV.some((item) => item.href === currentPath)) {
    context.set('project', projectId);
  }
  const { clear } = useSession();
  const headerOwner = account?.namespace.slug;
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);
  const deploymentNav = DEPLOYMENT_NAV.filter(
    (item) => item.href !== '/settings/provider-credentials' || canAdministerProviderCredentials
  );
  const namespaceLabel = account
    ? `${account.namespace.kind === 'organization' ? 'Organization' : 'Namespace'}: ${account.namespace.display_name}`
    : 'Namespace';
  const groups = [
    { id: 'personal', label: 'Personal', items: PERSONAL_NAV },
    { id: 'namespace', label: namespaceLabel, items: NAMESPACE_NAV },
    { id: 'deployment', label: 'Deployment', items: deploymentNav },
    { id: 'automation', label: 'Automations', items: AUTOMATION_NAV },
  ];
  const mobileDestination = groups
    .flatMap(({ items }) => items)
    .find((item) => item.activePaths.includes(currentPath))?.href;

  useEffect(
    () => setIsAuthEnabled(process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() !== 'true'),
    []
  );

  return (
    <div className={`${palette.scope} ${styles.accountLayout}`}>
      <DiscoverHeader
        owner={headerOwner}
        namespaceTab="settings"
        settingsHref={withSettingsContext('/settings', context)}
        newProjectHref={headerOwner ? `/${encodeURIComponent(headerOwner)}/new` : '/'}
        contextLabel="Account"
      />
      <div className={styles.mobileNavigation}>
        <label htmlFor="settings-destination">Settings</label>
        <select
          id="settings-destination"
          value={mobileDestination ?? currentPath}
          onChange={(event) => router.push(withSettingsContext(event.target.value, context))}
        >
          {!mobileDestination && <option value={currentPath}>Current settings page</option>}
          {groups.map(({ id, label, items }) => (
            <optgroup key={id} label={label}>
              {items.map((item) => (
                <option key={item.href} value={item.href}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {isAuthEnabled && (
          <button
            type="button"
            className={styles.mobileSignOut}
            aria-label="Sign out"
            onClick={() => void clear()}
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        )}
      </div>
      <div className={styles.shell}>
        <aside className={styles.sidebar} aria-label="Settings navigation">
          {groups.map(({ id, label, items }) => (
            <section key={id} aria-labelledby={`settings-${id}-group`}>
              <h2 className={styles.groupTitle} id={`settings-${id}-group`}>
                {label}
              </h2>
              <nav className={id === 'automation' ? styles.automationNav : styles.navList}>
                {items.map((item) => (
                  <SettingsNavLink
                    key={item.href}
                    item={item}
                    currentPath={currentPath}
                    context={context}
                  />
                ))}
              </nav>
            </section>
          ))}

          {isAuthEnabled ? (
            <button type="button" className={styles.signOut} onClick={() => void clear()}>
              <LogOut aria-hidden="true" size={18} />
              Sign out
            </button>
          ) : null}
        </aside>
        <div className={styles.content}>
          <SettingsReturnLink />
          {children}
        </div>
      </div>
    </div>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <SettingsLayoutContent>{children}</SettingsLayoutContent>
    </Suspense>
  );
}
