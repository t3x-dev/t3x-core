'use client';

import { ArrowRight, Blocks } from 'lucide-react';
import Link from 'next/link';
import { useDeploymentCapabilities } from '@/components/deployment/DeploymentCapabilitiesProvider';

export function ProviderSettingsOverviewCard() {
  const { canAdministerProviderCredentials } = useDeploymentCapabilities();
  if (!canAdministerProviderCredentials) return null;

  return (
    <Link
      href="/settings/providers"
      aria-label="AI Providers Configure"
      className="group rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] p-4 transition-colors hover:bg-[var(--hover-bg)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
          AI Providers
        </span>
        <Blocks className="h-4 w-4 text-[var(--text-tertiary)]" />
      </div>
      <div className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Model providers</div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
        Configure model, extraction, and generation credentials.
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--stroke-divider)] pt-3">
        <span className="text-[11px] text-[var(--text-tertiary)]">Global setting</span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-commit)]">
          Configure
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
