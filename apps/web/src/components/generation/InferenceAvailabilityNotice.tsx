'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useDeploymentCapabilities } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { buildReturnTo, withReturnTo } from '@/utils/navigationReturn';

export function InferenceAvailabilityNotice({
  loading,
  ready,
  error,
  onRetry,
}: {
  loading: boolean;
  ready: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { capabilities, status, administrationStatus, canAdministerProviderCredentials, refresh } =
    useDeploymentCapabilities();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (ready) return null;
  if (loading || status === 'loading') return <output>Checking AI availability…</output>;
  if (
    error ||
    status === 'error' ||
    administrationStatus === 'error' ||
    capabilities.inference.mode === 'unavailable'
  ) {
    return (
      <p role="alert">
        AI availability could not be checked.{' '}
        <button
          type="button"
          onClick={() => {
            refresh();
            onRetry();
          }}
        >
          Retry
        </button>
      </p>
    );
  }
  if (administrationStatus === 'loading') return <output>Checking operator permissions…</output>;
  if (capabilities.inference.mode === 'managed') {
    return (
      <output>
        Managed AI is currently unavailable. Retry or contact your administrator.{' '}
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </output>
    );
  }
  return (
    <output>
      AI service is unavailable.{' '}
      {canAdministerProviderCredentials ? (
        <Link
          href={withReturnTo(
            '/settings/provider-credentials',
            buildReturnTo(pathname ?? '/', searchParams?.toString())
          )}
        >
          Configure AI in global Settings
        </Link>
      ) : (
        'Contact your deployment administrator.'
      )}{' '}
      Sources can still be added and used.{' '}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </output>
  );
}
