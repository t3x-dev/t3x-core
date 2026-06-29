import { MessageCircle } from 'lucide-react';

export function ProjectCommunityTab() {
  return (
    <section className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <MessageCircle
          aria-hidden="true"
          className="mx-auto mb-3 h-8 w-8 text-[var(--accent-conversation)]"
        />
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Community</h2>
        <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">
          Shared project context and handoff notes stay outside deterministic mutation paths.
        </p>
      </div>
    </section>
  );
}
