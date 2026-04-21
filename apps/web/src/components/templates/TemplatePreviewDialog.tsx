'use client';

import { ClipboardPaste, Download, FileJson, FileText, Play } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExportTemplate } from '@/hooks/templates/useExportTemplate';
import type { Template, TemplateExportFormat } from '@/types/api';

interface TemplatePreviewDialogProps {
  template: Template | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (template: Template) => void;
}

function HighlightedPrompt({ text }: { text: string }) {
  // Highlight {{variable}} and {{#variable}}...{{/variable}} blocks
  const parts = text.split(/(\{\{[#/]?[a-zA-Z_][a-zA-Z0-9_]*\}\})/g);
  let partOffset = 0;

  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
      {parts.map((part) => {
        const partKey = `part-${partOffset}-${part}`;
        partOffset += part.length;
        if (/^\{\{[#/]?[a-zA-Z_][a-zA-Z0-9_]*\}\}$/.test(part)) {
          return (
            <span
              key={partKey}
              className="rounded bg-[var(--status-info)]/10 px-1 py-0.5 text-[var(--status-info)]"
            >
              {part}
            </span>
          );
        }
        return <span key={partKey}>{part}</span>;
      })}
    </pre>
  );
}

export function TemplatePreviewDialog({
  template,
  open,
  onOpenChange,
  onUse,
}: TemplatePreviewDialogProps) {
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const { run: exportTemplate } = useExportTemplate();

  const handleExport = async (format: TemplateExportFormat) => {
    if (!template) return;
    const result = await exportTemplate(template, format);
    if (result.success) {
      setExportMsg(result.message);
      setTimeout(() => setExportMsg(null), 2000);
    }
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template.title}
            {template.is_builtin && (
              <Badge variant="outline" className="text-[10px]">
                Built-in
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="outline">{template.category}</Badge>
          <Badge variant="outline">{template.leaf_type}</Badge>
          {template.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>

        <Tabs defaultValue="system" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="system" className="flex-1">
              System Prompt
            </TabsTrigger>
            <TabsTrigger value="user" className="flex-1">
              User Prompt
            </TabsTrigger>
            <TabsTrigger value="variables" className="flex-1">
              Variables ({template.variables.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="system" className="flex-1 overflow-auto mt-2">
            <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-base)] p-4">
              <HighlightedPrompt text={template.system_prompt} />
            </div>
          </TabsContent>
          <TabsContent value="user" className="flex-1 overflow-auto mt-2">
            <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-base)] p-4">
              <HighlightedPrompt text={template.user_prompt} />
            </div>
          </TabsContent>
          <TabsContent value="variables" className="flex-1 overflow-auto mt-2">
            <div className="space-y-2">
              {template.variables.length === 0 ? (
                <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">
                  No variables defined
                </p>
              ) : (
                template.variables.map((v) => (
                  <div
                    key={v.name}
                    className="flex items-start gap-3 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-base)] p-3"
                  >
                    <code className="rounded bg-[var(--status-info)]/10 px-1.5 py-0.5 text-xs text-[var(--status-info)] shrink-0">
                      {`{{${v.name}}}`}
                    </code>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--text-secondary)]">{v.description}</p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant={v.required ? 'default' : 'outline'} className="text-[10px]">
                          {v.required ? 'Required' : 'Optional'}
                        </Badge>
                        {v.defaultValue !== undefined && (
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            default: &ldquo;{v.defaultValue || '(empty)'}&rdquo;
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {exportMsg && (
          <p className="text-xs text-[var(--status-success)] text-center">{exportMsg}</p>
        )}

        <DialogFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Download className="h-3 w-3" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => handleExport('clipboard')}>
                <ClipboardPaste className="mr-2 h-4 w-4" />
                Copy Prompt
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('markdown')}>
                <FileText className="mr-2 h-4 w-4" />
                Export as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                <FileJson className="mr-2 h-4 w-4" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onUse(template);
            }}
            className="gap-1"
          >
            <Play className="h-3 w-3" />
            Use Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
