import { FileCheck2 } from 'lucide-react';

export function ProjectReviewsTab() {
  return (
    <section className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <FileCheck2 aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-[var(--status-info)]" />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Reviews</h2>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
          Project-scoped validation and review queues will attach here after S1.
        </p>
      </div>
    </section>
  );
}
