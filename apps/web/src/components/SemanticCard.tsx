import { GitBranch, GitCommit, MessageSquare, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useTerminology } from '@/hooks/shared/useTerminology';
import { cn } from '@/utils/cn';
import type { SemanticEntry } from '../types/semantic';

const stageConfig = {
  commit: {
    label: 'Commit',
    Icon: GitCommit,
    variant: 'default' as const,
    className: 'bg-[var(--status-info)]/10 text-[var(--status-info)] border-[var(--status-info)]/20 hover:bg-[var(--status-info)]/15',
  },
  draft: {
    label: 'Draft',
    Icon: GitBranch,
    variant: 'outline' as const,
    className:
      'bg-[var(--status-warning)]/10 text-[var(--status-warning)] border-[var(--status-warning)]/20 hover:bg-[var(--status-warning)]/15',
  },
  turn: {
    label: 'Conversation',
    Icon: MessageSquare,
    variant: 'secondary' as const,
    className:
      'bg-[var(--status-success)]/10 text-[var(--status-success)] border-[var(--status-success)]/20 hover:bg-[var(--status-success)]/15',
  },
} as const;

interface SemanticCardProps {
  entry: SemanticEntry;
}

export function SemanticCard({ entry }: SemanticCardProps) {
  const { t } = useTerminology();
  const config = stageConfig[entry.stage];
  const Icon = config.Icon;

  // Override static labels with terminology-aware translations
  const label =
    entry.stage === 'commit' ? t('commit') : entry.stage === 'draft' ? t('draft') : config.label;

  return (
    <Card className="elevation-1 elevation-hover">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <code className="text-xs text-muted-foreground">{entry.id}</code>
              <Badge variant="outline" className={cn('gap-1', config.className)}>
                <Icon className="h-3 w-3" />
                {label}
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
