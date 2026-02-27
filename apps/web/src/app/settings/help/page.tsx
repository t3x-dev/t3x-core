'use client';

import { ExternalLink, FileText, Github } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ResourceRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  badge?: string;
}

function ResourceRow({ icon, title, description, href, badge }: ResourceRowProps) {
  const content = (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--stroke-divider)] p-4 transition-colors hover:border-[var(--stroke-default)] hover:bg-[var(--hover-bg)]">
      <div className="shrink-0 text-[var(--text-tertiary)]">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
          {badge && (
            <Badge variant="outline" className="text-xs text-[var(--text-tertiary)]">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>
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
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Help & Resources</h1>
      <p className="text-sm text-[var(--text-secondary)] mt-1 mb-8">
        External links, documentation, and community resources.
      </p>

      <section className="flex flex-col gap-3">
        <ResourceRow
          icon={<Github className="h-5 w-5" />}
          title="GitHub Repository"
          description="Source code, issues, and discussions."
          href="https://github.com/anthropics/t3x"
        />
        <ResourceRow
          icon={<FileText className="h-5 w-5" />}
          title="Documentation"
          description="Guides, API reference, and tutorials."
          badge="Coming Soon"
        />
      </section>
    </div>
  );
}
