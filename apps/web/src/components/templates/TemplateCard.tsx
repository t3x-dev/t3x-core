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
import type { Template } from '@/lib/api';
import { cn } from '@/lib/utils';

const LEAF_TYPE_ICONS: Record<string, React.ElementType> = {
  tweet: Hash,
  article: FileText,
  email: Mail,
  weibo: AtSign,
  wechat: MessageCircle,
  slack: MessageSquare,
};

const CATEGORY_COLORS: Record<string, string> = {
  social: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
  business: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
  technical: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400',
  creative: 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400',
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
              className="h-7 w-7 p-0 text-[var(--text-tertiary)] hover:text-red-500"
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
