import type { ReactNode } from 'react';

export function ProjectStateTab({ children }: { children: ReactNode }) {
  return <section className="relative h-full min-h-0 overflow-hidden">{children}</section>;
}
