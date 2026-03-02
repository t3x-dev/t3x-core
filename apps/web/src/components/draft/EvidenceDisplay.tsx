'use client';

import { Quote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { LocatedEvidenceAPI } from '@/lib/api';

interface EvidenceDisplayProps {
  evidence: LocatedEvidenceAPI[];
}

export function EvidenceDisplay({ evidence }: EvidenceDisplayProps) {
  const enabled = evidence.filter((e) => e.enabled);
  if (enabled.length === 0) return null;

  return (
    <div className="space-y-1.5 pl-3 border-l-2 border-muted">
      {enabled.map((e, i) => (
        <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Quote className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="space-y-0.5">
            <p className="italic">&ldquo;{e.quoted_text}&rdquo;</p>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {e.role}
              </Badge>
              <span>{e.relevance}</span>
              <span className="text-muted-foreground/60">
                ({Math.round(e.match_score * 100)}% match)
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
