import { Settings } from 'lucide-react';

export function ProjectSettingsTab() {
  return (
    <section className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <Settings aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-[var(--text-tertiary)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Settings</h2>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
          Project defaults and schema binding controls will stay scoped to this project.
        </p>
      </div>
    </section>
  );
}
