import { PreferencesSettingsPanel } from '@/components/settings/PreferencesSettingsPanel';

export default function PreferencesPage() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Preferences</h1>
      <p className="mt-1 mb-8 text-sm text-[var(--text-secondary)]">
        Customize your T3X experience. Changes are saved automatically.
      </p>
      <PreferencesSettingsPanel />
    </div>
  );
}
