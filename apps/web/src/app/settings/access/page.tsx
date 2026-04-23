import { AccessSettingsPanel } from '@/components/settings/AccessSettingsPanel';

export default function AccessPage() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">API Access</h1>
      <p className="mt-1 mb-8 text-sm text-[var(--text-secondary)]">
        Configure the shared local API URL and key used by WebUI, CLI, and MCP.
      </p>
      <AccessSettingsPanel />
    </div>
  );
}
