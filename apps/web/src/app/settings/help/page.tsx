'use client';

import { ExternalLink, Github } from 'lucide-react';
import styles from '../SettingsPage.module.css';

interface ResourceRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
}

function ResourceRow({ icon, title, description, href }: ResourceRowProps) {
  const content = (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--stroke-divider)] p-4 transition-colors hover:border-[var(--stroke-default)] hover:bg-[var(--hover-bg)]">
      <div className="shrink-0 text-[var(--text-tertiary)]">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
      {href && <ExternalLink className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return content;
}

export default function HelpPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Help & Resources</h1>
        <p>External links, documentation, and community resources.</p>
      </header>
      <section className={styles.content}>
        <ResourceRow
          icon={<Github className="h-5 w-5" />}
          title="GitHub Repository"
          description="Source code, issues, and discussions."
          href="https://github.com/t3x-dev/t3x-core"
        />
      </section>
    </div>
  );
}
