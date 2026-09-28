import { ProviderSettingsCapabilityGate } from '@/components/settings/ProviderSettingsCapabilityGate';

export default function ProviderCredentialsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Provider credentials</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Configure local provider API keys and connection defaults.
        </p>
      </div>
      <ProviderSettingsCapabilityGate />
    </div>
  );
}
