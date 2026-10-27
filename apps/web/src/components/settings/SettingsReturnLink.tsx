'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDeploymentCapabilities } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { safeInternalReturnTo } from '@/utils/navigationReturn';

export function SettingsReturnLink() {
  const params = useSearchParams();
  const { refresh } = useDeploymentCapabilities();
  const returnTo = safeInternalReturnTo(params.get('returnTo'), '');
  if (!returnTo) return null;
  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pt-6 sm:px-8 lg:px-12">
      <Link
        className="mb-4 inline-block text-sm underline"
        href={returnTo}
        onClick={() => {
          refresh();
          window.dispatchEvent(new Event('t3x:provider-configuration-changed'));
        }}
      >
        Return to Workspace
      </Link>
    </div>
  );
}
