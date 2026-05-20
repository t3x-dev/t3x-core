import { AccessSettingsPanel } from '@/components/settings/AccessSettingsPanel';

export default function AccessPage() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">API Access</h1>
      <p className="mt-1 mb-8 text-sm text-[var(--text-secondary)]">
        Configure the standalone API host&apos;s local API URL and key. In a one-machine setup,
        WebUI, CLI, and MCP can share the same file.
      </p>
      <div className="mb-8 rounded-2xl border border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        Environment variables override the shared file, so this page shows the effective state
        before you save.
      </div>
      <AccessSettingsPanel />
    </div>
  );
}
