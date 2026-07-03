import { AccessSettingsPanel } from '@/components/settings/AccessSettingsPanel';

export default function AccessPage() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">API Access</h1>
      <p className="mt-1 mb-8 text-sm text-[var(--text-secondary)]">
        Manage T3X API keys plus the local API URL/key used by WebUI, CLI, and MCP.
      </p>
      <div className="mb-8 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-primary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        Environment variables override the shared file, so this page shows the effective state
        before you save.
      </div>
      <AccessSettingsPanel />
    </div>
  );
}
