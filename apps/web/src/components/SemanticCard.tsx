import { GitBranch, GitCommit, MessageSquare, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SemanticEntry } from '../types/semantic';

const stageConfig = {
  commit: {
    label: 'Commit',
    Icon: GitCommit,
    variant: 'default' as const,
    className: 'bg-blue-500/10 text-[var(--status-info)] border-blue-500/20 hover:bg-blue-500/15',
  },
  draft: {
    label: 'Draft',
    Icon: GitBranch,
    variant: 'outline' as const,
    className: 'bg-amber-500/10 text-[var(--status-warning)] border-amber-500/20 hover:bg-amber-500/15',
  },
  turn: {
    label: 'Conversation',
    Icon: MessageSquare,
    variant: 'secondary' as const,
    className: 'bg-emerald-500/10 text-[var(--status-success)] border-emerald-500/20 hover:bg-emerald-500/15',
  },
} as const;

interface SemanticCardProps {
  entry: SemanticEntry;
}

export function SemanticCard({ entry }: SemanticCardProps) {
  const config = stageConfig[entry.stage];
  const Icon = config.Icon;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <code className="text-xs text-muted-foreground">{entry.id}</code>
              <Badge variant="outline" className={cn('gap-1', config.className)}>
                <Icon className="h-3 w-3" />
                {config.label}
              </Badge>
            </div>
            <h3 className="font-semibold leading-tight">{entry.title}</h3>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
            <span>{entry.updatedAt}</span>
            <span className="text-right">{entry.bridgePrompt}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{entry.summary}</p>

        {entry.facets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entry.facets.map((facet) => (
              <Badge key={facet} variant="secondary" className="text-xs">
                {facet}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between pt-0">
        <div className="flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{entry.evidenceCount} evidence</span>
        </div>
      </CardFooter>
    </Card>
  );
}
