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
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useDeploymentCapabilities } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { DiscoverHeader } from '@/components/schemas/DiscoverHeader';
import { SettingsReturnLink } from '@/components/settings/SettingsReturnLink';
import { useNamespaceAccounts } from '@/hooks/accounts/useNamespaceAccounts';
import { useSession } from '@/hooks/shared/useSession';
import palette from '@/styles/management-palette.module.css';
import { safeInternalReturnTo } from '@/utils/navigationReturn';
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

function withSettingsContext(href: string, context: URLSearchParams): string {
  const params = new URLSearchParams(context);
  if (href !== '/settings/provider-credentials') params.delete('owner');
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
  // Provider credentials accepts an owner as navigation context, not as an account selector.
  // Namespace settings always use the account selected by useNamespaceAccounts.
  const credentialOwner =
    currentPath === '/settings/provider-credentials'
      ? searchParams.get('owner')?.trim()
      : undefined;
  const context = new URLSearchParams();
  if (credentialOwner) context.set('owner', credentialOwner);
  const returnTo = safeInternalReturnTo(searchParams.get('returnTo'), '');
  if (returnTo) context.set('returnTo', returnTo);
  const projectId = searchParams.get('project')?.trim();
  if (projectId && AUTOMATION_NAV.some((item) => item.href === currentPath)) {
    context.set('project', projectId);
  }
  const { clear, getKey } = useSession();
  const { activeAccount } = useNamespaceAccounts();
  const headerOwner = credentialOwner || activeAccount?.namespace.slug;
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);
  const personalNav = PERSONAL_NAV.filter(
    (item) => item.href !== '/settings/provider-credentials' || canAdministerProviderCredentials
  );
  const namespaceLabel = activeAccount
    ? `${activeAccount.namespace.kind === 'organization' ? 'Organization' : 'Namespace'}: ${activeAccount.namespace.display_name}`
    : 'No active namespace';
  const mobileDestination = [...personalNav, ...ORGANIZATION_NAV, ...AUTOMATION_NAV].find((item) =>
    item.activePaths.includes(currentPath)
  )?.href;

  useEffect(() => setIsAuthEnabled(Boolean(getKey())), [getKey]);

  return (
    <div className={`${palette.scope} ${styles.accountLayout}`}>
      <DiscoverHeader
        owner={headerOwner}
        namespaceTab="settings"
        settingsHref={withSettingsContext('/settings/provider-credentials', context)}
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
          <optgroup label="Personal">
            {personalNav.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </optgroup>
          <optgroup label={namespaceLabel}>
            {ORGANIZATION_NAV.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Automations">
            {AUTOMATION_NAV.map((item) => (
              <option key={item.href} value={item.href}>
                {item.label}
              </option>
            ))}
          </optgroup>
        </select>
        {isAuthEnabled && (
          <button
            type="button"
            className={styles.mobileSignOut}
            aria-label="Sign out"
            onClick={() => clear()}
          >
            <LogOut aria-hidden="true" size={18} />
          </button>
        )}
      </div>
      <div className={styles.shell}>
        <aside className={styles.sidebar} aria-label="Settings navigation">
          <section>
            <h2 className={styles.groupTitle}>Personal</h2>
            <nav className={styles.navList}>
              {personalNav.map((item) => (
                <SettingsNavLink
                  key={item.label}
                  item={item}
                  currentPath={currentPath}
                  context={context}
                />
              ))}
            </nav>
          </section>

          <section>
            <h2 className={styles.groupTitle}>{namespaceLabel}</h2>
            <nav className={styles.navList}>
              {ORGANIZATION_NAV.map((item) => (
                <SettingsNavLink
                  key={item.label}
                  item={item}
                  currentPath={currentPath}
                  context={context}
                />
              ))}
            </nav>
            <div className={styles.automationSection}>
              <div className={styles.automationTitle}>
                <Zap aria-hidden="true" size={18} strokeWidth={2} />
                <span>Automations</span>
              </div>
              <nav className={styles.automationNav} aria-label="Automations">
                {AUTOMATION_NAV.map((item) => (
                  <SettingsNavLink
                    key={item.label}
                    item={item}
                    currentPath={currentPath}
                    context={context}
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
