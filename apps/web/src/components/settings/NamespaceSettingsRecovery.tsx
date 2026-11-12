'use client';

import Link from 'next/link';
import { useDeploymentCapabilities } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { namespaceSettingsHref } from '@/domain/settingsLocation';
import type { useSettingsNamespace } from '@/hooks/settings/useSettingsNamespace';

export function NamespaceSettingsRecovery({
  context,
}: {
  context: ReturnType<typeof useSettingsNamespace>;
}) {
  const { capabilities, status } = useDeploymentCapabilities();
  const authDisabled = process.env.NEXT_PUBLIC_AUTH_DISABLED?.toLowerCase() === 'true';
  const { requested, activeAccount, error, isLoading, refetch, returnTo } = context;
  if (isLoading && !error) return <p>Loading namespaces…</p>;

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert">Could not load namespaces.</p>
      ) : (
        <p>
          {requested
            ? 'This namespace is unavailable to your account.'
            : 'No active namespace is available.'}
        </p>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm underline">
        {error && (
          <button type="button" onClick={() => void refetch()}>
            Retry namespaces
          </button>
        )}
        {!error && requested && activeAccount && (
          <Link href={namespaceSettingsHref(activeAccount.namespace.slug, returnTo)}>
            Open {activeAccount.namespace.display_name} settings
          </Link>
        )}
        {!error &&
          !activeAccount &&
          !authDisabled &&
          status === 'ready' &&
          capabilities.identity.mode === 'local' &&
          capabilities.identity.namespaces && (
            <Link href="/onboarding/namespace">Set up your namespace</Link>
          )}
        <Link href="/repositories">Browse repositories</Link>
      </div>
    </div>
  );
}
