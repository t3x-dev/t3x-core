'use client';

import { Cloud, Loader2, ShieldAlert } from 'lucide-react';
import { useDeploymentCapabilities } from '@/components/deployment/DeploymentCapabilitiesProvider';
import { ProvidersSettingsPanel } from '@/components/settings/ProvidersSettingsPanel';

export function ProviderSettingsCapabilityGate() {
  const { capabilities, canAdministerProviderCredentials, status } = useDeploymentCapabilities();

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking deployment capabilities…
      </div>
    );
  }

  if (canAdministerProviderCredentials) return <ProvidersSettingsPanel />;

  if (status === 'ready' && capabilities.inference.mode === 'managed') {
    return (
      <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Cloud className="h-4 w-4" />
          Managed inference
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          This deployment manages model access centrally. Provider API keys cannot be viewed,
          stored, tested, or changed from this WebUI.
        </p>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/5 p-5"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <ShieldAlert className="h-4 w-4 text-[var(--status-warning)]" />
        Provider settings unavailable
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
        T3X could not verify whether this deployment permits local provider credentials. No provider
        administration actions are enabled.
      </p>
    </div>
  );
}
