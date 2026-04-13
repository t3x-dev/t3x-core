'use client';

import { AlertTriangle, Code, FileText, Heading, List, Quote, Table } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ImportParagraph } from '@/infrastructure';
import { cn } from '@/lib/utils';

interface ImportPreviewProps {
  paragraphs: ImportParagraph[];
  maxHeight?: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  heading: <Heading className="h-3 w-3 shrink-0" />,
  paragraph: <FileText className="h-3 w-3 shrink-0" />,
  code: <Code className="h-3 w-3 shrink-0" />,
  list_item: <List className="h-3 w-3 shrink-0" />,
  table: <Table className="h-3 w-3 shrink-0" />,
  blockquote: <Quote className="h-3 w-3 shrink-0" />,
};

export function ImportPreview({ paragraphs, maxHeight = '300px' }: ImportPreviewProps) {
  if (paragraphs.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <AlertTriangle className="h-4 w-4" />
        No content found
      </div>
    );
  }

  return (
    <ScrollArea style={{ maxHeight }} className="rounded-lg border">
      <div className="space-y-1 p-3">
        {paragraphs.map((p) => (
          <div
            key={p.index}
            className={cn(
              'flex items-start gap-2 rounded px-2 py-1 text-xs',
              p.type === 'heading' && 'font-semibold text-foreground',
              p.type === 'code' && 'font-mono bg-muted/50',
              p.type !== 'heading' && p.type !== 'code' && 'text-muted-foreground'
            )}
          >
            {typeIcons[p.type] || <FileText className="h-3 w-3 shrink-0" />}
            <span className="line-clamp-2 break-all">{p.text}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
