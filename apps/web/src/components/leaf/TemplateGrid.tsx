'use client';

import { FileText, Mail, MessageCircle, MessageSquare, PenTool } from 'lucide-react';
import { useMemo } from 'react';
import { useTemplatesList } from '@/hooks/useTemplatesList';
import { cn } from '@/lib/utils';
import type { Template } from '@/types/api';

export interface LeafTemplate {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  constraints: { type: 'require' | 'exclude'; match_mode: 'exact' | 'semantic'; value: string }[];
  semantic_threshold?: { require: number; exclude: number };
}

/** Default/fallback templates used when API is unavailable or returns empty */
const DEFAULT_TEMPLATES: LeafTemplate[] = [
  {
    type: 'tweet',
    label: 'Tweet',
    description: '\u2264280 characters, concise',
    icon: <MessageCircle className="h-5 w-5" />,
    constraints: [
      { type: 'require', match_mode: 'exact', value: 'Must be 280 characters or fewer' },
    ],
    semantic_threshold: { require: 0.85, exclude: 0.8 },
  },
  {
    type: 'email',
    label: 'Email',
    description: 'Formal, structured',
    icon: <Mail className="h-5 w-5" />,
    constraints: [
      { type: 'require', match_mode: 'semantic', value: 'Must include greeting and sign-off' },
    ],
    semantic_threshold: { require: 0.8, exclude: 0.75 },
  },
  {
    type: 'article',
    label: 'Article',
    description: 'Long-form, detailed',
    icon: <FileText className="h-5 w-5" />,
    constraints: [],
    semantic_threshold: { require: 0.75, exclude: 0.7 },
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Casual, brief',
    icon: <MessageSquare className="h-5 w-5" />,
    constraints: [],
    semantic_threshold: { require: 0.8, exclude: 0.75 },
  },
  {
    type: 'custom',
    label: 'Custom',
    description: 'No preset constraints',
    icon: <PenTool className="h-5 w-5" />,
    constraints: [],
  },
];

/** Map leaf_type to icon component */
const ICON_MAP: Record<string, React.ReactNode> = {
  tweet: <MessageCircle className="h-5 w-5" />,
  email: <Mail className="h-5 w-5" />,
  article: <FileText className="h-5 w-5" />,
  slack: <MessageSquare className="h-5 w-5" />,
  custom: <PenTool className="h-5 w-5" />,
};

/** Convert an API Template to a LeafTemplate for the grid */
function apiTemplateToLeafTemplate(t: Template): LeafTemplate {
  return {
    type: t.leaf_type,
    label: t.title,
    description: t.description,
    icon: ICON_MAP[t.leaf_type] ?? <PenTool className="h-5 w-5" />,
    constraints: t.default_constraints,
    semantic_threshold: t.semantic_threshold ?? undefined,
  };
}

interface TemplateGridProps {
  selected: string | null;
  onSelect: (template: LeafTemplate) => void;
}

export function TemplateGrid({ selected, onSelect }: TemplateGridProps) {
  const { templates: apiTemplates, loading: isLoading, error } = useTemplatesList();

  // Convert API templates -> LeafTemplate[], with graceful fallback to
  // DEFAULT_TEMPLATES when the API returns empty or errored (same
  // degradation behaviour the component had inline).
  const templates = useMemo<LeafTemplate[]>(() => {
    if (error || apiTemplates.length === 0) return DEFAULT_TEMPLATES;
    const converted = apiTemplates.map(apiTemplateToLeafTemplate);
    const hasCustom = converted.some((t) => t.type === 'custom');
    if (!hasCustom) converted.push(DEFAULT_TEMPLATES[DEFAULT_TEMPLATES.length - 1]);
    return converted;
  }, [apiTemplates, error]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {isLoading &&
        DEFAULT_TEMPLATES.map((t) => (
          <div
            key={t.type}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-center animate-pulse"
          >
            <div className="h-5 w-5 rounded bg-muted" />
            <div className="h-4 w-12 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        ))}
      {!isLoading &&
        templates.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors hover:bg-accent/50',
              selected === t.type
                ? 'ring-2 ring-primary border-primary bg-primary/5'
                : 'border-border'
            )}
          >
            <div className="text-muted-foreground">{t.icon}</div>
            <span className="text-sm font-medium">{t.label}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">{t.description}</span>
          </button>
        ))}
    </div>
  );
}
