import { PanelTop } from 'lucide-react';

export function ProjectOutputsTab() {
  return (
    <section className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <PanelTop aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-[var(--accent-leaf)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Outputs</h2>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
          Generated project outputs remain separated from workspace source bundles.
        </p>
      </div>
    </section>
  );
}
