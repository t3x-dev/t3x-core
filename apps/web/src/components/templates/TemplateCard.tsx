'use client';

import {
  AtSign,
  Eye,
  FileText,
  Hash,
  Mail,
  MessageCircle,
  MessageSquare,
  Play,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Template } from '@/types/api';

const LEAF_TYPE_ICONS: Record<string, React.ElementType> = {
  tweet: Hash,
  article: FileText,
  email: Mail,
  weibo: AtSign,
  wechat: MessageCircle,
  slack: MessageSquare,
};

const CATEGORY_COLORS: Record<string, string> = {
  social: 'bg-[var(--status-info)]/10 text-[var(--status-info)] border-[var(--status-info)]/20',
  business:
    'bg-[var(--status-success)]/10 text-[var(--status-success)] border-[var(--status-success)]/20',
  technical: 'bg-[var(--source)]/10 text-[var(--source)] border-[var(--source)]/20',
  creative:
    'bg-[var(--accent-pending)]/10 text-[var(--accent-pending)] border-[var(--accent-pending)]/20',
};

interface TemplateCardProps {
  template: Template;
  onPreview: (template: Template) => void;
  onUse: (template: Template) => void;
  onDelete?: (template: Template) => void;
}

export function TemplateCard({ template, onPreview, onUse, onDelete }: TemplateCardProps) {
  const Icon = LEAF_TYPE_ICONS[template.leaf_type] ?? FileText;

  return (
    <Card
      className={cn(
        'group relative overflow-hidden transition-all duration-200',
        'hover:shadow-md hover:ring-1 hover:ring-[var(--stroke-default)]',
        'bg-[var(--surface-card)]'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover-bg)]">
              <Icon className="h-4 w-4 text-[var(--text-secondary)]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {template.title}
              </h3>
              <span className="text-xs text-[var(--text-tertiary)]">{template.leaf_type}</span>
            </div>
          </div>
          {template.is_builtin && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              Built-in
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{template.description}</p>

        <div className="flex flex-wrap gap-1">
          <Badge
            variant="outline"
            className={cn('text-[10px] border', CATEGORY_COLORS[template.category])}
          >
            {template.category}
          </Badge>
          {template.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-1 gap-1 text-xs"
            onClick={() => onPreview(template)}
          >
            <Eye className="h-3 w-3" />
            Preview
          </Button>
          <Button size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={() => onUse(template)}>
            <Play className="h-3 w-3" />
            Use
          </Button>
          {onDelete && !template.is_builtin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-[var(--text-tertiary)] hover:text-[var(--status-error)]"
              onClick={() => onDelete(template)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
