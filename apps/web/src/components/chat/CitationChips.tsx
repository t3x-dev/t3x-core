'use client';

import { ExternalLink } from 'lucide-react';

interface CitationChipsProps {
  citations: Array<{ url: string; title: string }>;
}

export function CitationChips({ citations }: CitationChipsProps) {
  if (citations.length === 0) return null;

  const uniqueCitations = citations.filter(
    (cite, index) => citations.findIndex((candidate) => candidate.url === cite.url) === index
  );

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {uniqueCitations.map((cite) => {
        let domain: string;
        try {
          domain = new URL(cite.url).hostname.replace('www.', '');
        } catch {
          domain = cite.url;
        }

        return (
          <a
            key={cite.url}
            href={cite.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-primary)]"
            title={cite.title}
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate max-w-[120px]">{domain}</span>
          </a>
        );
      })}
    </div>
  );
}
