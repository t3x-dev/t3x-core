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
  if (loading || status === 'loading') return <output>Checking AI…</output>;
  if (
    error ||
    status === 'error' ||
    administrationStatus === 'error' ||
    capabilities.inference.mode === 'unavailable'
  ) {
    return (
      <p role="alert">
        AI status unavailable.{' '}
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
        Managed AI unavailable. Contact your administrator or retry.{' '}
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </output>
    );
  }
  return (
    <output>
      AI unavailable.{' '}
      {canAdministerProviderCredentials ? (
        <Link
          href={withReturnTo(
            '/settings/provider-credentials',
            buildReturnTo(pathname ?? '/', searchParams?.toString())
          )}
        >
          Configure AI
        </Link>
      ) : (
        'Contact your deployment administrator.'
      )}{' '}
      Sources remain available.{' '}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </output>
  );
}
