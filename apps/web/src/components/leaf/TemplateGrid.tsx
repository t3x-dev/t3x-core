'use client';

import { FileText, Mail, MessageCircle, MessageSquare, PenTool, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LeafTemplate {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  constraints: { type: 'require' | 'exclude'; match_mode: 'exact' | 'semantic'; value: string }[];
}

const TEMPLATES: LeafTemplate[] = [
  {
    type: 'tweet',
    label: 'Tweet',
    description: '≤280 characters, concise',
    icon: <MessageCircle className="h-5 w-5" />,
    constraints: [
      { type: 'require', match_mode: 'exact', value: 'Must be 280 characters or fewer' },
    ],
  },
  {
    type: 'email',
    label: 'Email',
    description: 'Formal, structured',
    icon: <Mail className="h-5 w-5" />,
    constraints: [
      { type: 'require', match_mode: 'semantic', value: 'Must include greeting and sign-off' },
    ],
  },
  {
    type: 'article',
    label: 'Article',
    description: 'Long-form, detailed',
    icon: <FileText className="h-5 w-5" />,
    constraints: [],
  },
  {
    type: 'slack',
    label: 'Slack',
    description: 'Casual, brief',
    icon: <MessageSquare className="h-5 w-5" />,
    constraints: [],
  },
  {
    type: 'eval',
    label: 'Eval',
    description: 'Test assertions',
    icon: <Settings className="h-5 w-5" />,
    constraints: [],
  },
  {
    type: 'custom',
    label: 'Custom',
    description: 'Blank slate',
    icon: <PenTool className="h-5 w-5" />,
    constraints: [],
  },
];

interface TemplateGridProps {
  selected: string | null;
  onSelect: (template: LeafTemplate) => void;
}

export function TemplateGrid({ selected, onSelect }: TemplateGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TEMPLATES.map((t) => (
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
