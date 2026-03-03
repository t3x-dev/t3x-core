'use client';

import { ChevronDown, ChevronRight, ExternalLink, Quote } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { LocatedEvidenceAPI } from '@/lib/api';

interface EvidenceDisplayProps {
  evidence: LocatedEvidenceAPI[];
  defaultExpanded?: boolean;
  projectId?: string;
}

function MatchScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-muted-foreground/60">{pct}%</span>
    </div>
  );
}

export function EvidenceDisplay({
  evidence,
  defaultExpanded = false,
  projectId,
}: EvidenceDisplayProps) {
  const enabled = evidence.filter((e) => e.enabled);
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (enabled.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Quote className="h-3 w-3" />
        <span>
          {enabled.length} source{enabled.length !== 1 ? 's' : ''}
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 pl-3 border-l-2 border-muted">
          {enabled.map((e, i) => {
            // anchor_type may be returned by the API but is not yet in LocatedEvidenceAPI
            const anchorType = (e as unknown as Record<string, unknown>).anchor_type as
              | string
              | undefined;
            return (
              <div
                key={`${e.conversation_id}-${e.turn_hash}-${e.start_char}-${i}`}
                className="flex items-start gap-1.5 text-xs text-muted-foreground"
              >
                <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                <div className="space-y-0.5">
                  {projectId ? (
                    <Link
                      href={`/project/${projectId}/conversation/${e.conversation_id}#turn_${e.turn_hash}`}
                      className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      Conv ...{e.conversation_id.slice(-4)} · Turn ...
                      {e.turn_hash.replace('sha256:', '').slice(-4)}
                    </Link>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      Turn ...{e.turn_hash.replace('sha256:', '').slice(-4)}
                    </span>
                  )}
                  <p
                    className={`italic${anchorType === 'paraphrase' ? ' underline decoration-dotted decoration-yellow-500' : ''}`}
                  >
                    &ldquo;{e.quoted_text}&rdquo;
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {e.role}
                    </Badge>
                    {anchorType === 'paraphrase' && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                      >
                        Paraphrased
                      </Badge>
                    )}
                    {anchorType === 'inference' && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      >
                        Inferred
                      </Badge>
                    )}
                    <span>{e.relevance}</span>
                    <MatchScoreBar score={e.match_score} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
