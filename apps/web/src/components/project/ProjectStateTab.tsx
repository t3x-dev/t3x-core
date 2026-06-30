import type { ReactNode } from 'react';

export function ProjectStateTab({ children }: { children: ReactNode }) {
  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden">{children}</section>
  );
}
