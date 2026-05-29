'use client';

import { ExternalLink, FileText, Github, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ResourceRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  badge?: string;
}

function ResourceRow({ icon, title, description, href, onClick, badge }: ResourceRowProps) {
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

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full cursor-pointer text-left">
        {content}
      </button>
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
          icon={<ListChecks className="h-5 w-5" />}
          title="Quick Start Checklist"
          description="Reopen the onboarding checklist to review setup steps."
          onClick={() => {
            localStorage.removeItem('t3x-quickstart-dismissed');
            window.dispatchEvent(new Event('t3x-quickstart-reopen'));
          }}
        />
        <ResourceRow
          icon={<Github className="h-5 w-5" />}
          title="GitHub Repository"
          description="Source code, issues, and discussions."
          href="https://github.com/t3x-dev/t3x-core"
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
