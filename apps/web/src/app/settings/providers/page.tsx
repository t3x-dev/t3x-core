import { ProvidersSettingsPanel } from '@/components/settings/ProvidersSettingsPanel';

export default function ProvidersPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Providers</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Configure LLM, embedding, and NLP providers for T3X features.
        </p>
      </div>
      <ProvidersSettingsPanel />
    </div>
  );
}
