'use client';

import { ArrowLeft, ClipboardPaste, Copy, Download, FileJson, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { ShareLinkButton } from '@/components/shared/ShareLinkButton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkspaceMode } from '@/hooks/useLeafPageData';
import { useTerminology } from '@/hooks/useTerminology';
import type { Leaf } from '@/lib/api';
import type { ExportFormat } from '@/lib/export';
import { cn } from '@/lib/utils';

interface LeafWorkspaceHeaderProps {
  leaf: Leaf;
  projectId: string;
  projectName: string | undefined;
  onExport: (format: ExportFormat) => Promise<void>;
  mode?: WorkspaceMode;
  onModeChange?: (mode: WorkspaceMode) => void;
  className?: string;
}

export function LeafWorkspaceHeader({
  leaf,
  projectId,
  projectName,
  onExport,
  mode,
  onModeChange,
  className,
}: LeafWorkspaceHeaderProps) {
  const router = useRouter();
  const { t } = useTerminology();

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-4',
        'bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)]',
        'backdrop-blur-[6px]',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push(`/project/${projectId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Breadcrumb
          segments={[
            { label: 'Home', href: '/' },
            { label: projectName || 'Project', href: `/project/${projectId}` },
            {
              label: `${t('commit')} ${leaf.commit_hash.replace('sha256:', '').slice(0, 7)}`,
              href: `/project/${projectId}?focus=${leaf.commit_hash}`,
            },
            { label: leaf.title || `Leaf: ${leaf.id.slice(0, 12)}...` },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {leaf.type}
          </span>
          {/* Created date removed — available in footer */}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Mode toggle */}
        {mode && onModeChange && (
          <div className="inline-flex rounded-md border border-[var(--stroke-default)] overflow-hidden mr-2">
            <button
              type="button"
              className={cn(
                'px-3 py-1 text-xs font-medium transition-all',
                mode === 'generate'
                  ? 'bg-[var(--accent-leaf)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => onModeChange('generate')}
            >
              Generate
            </button>
            <button
              type="button"
              className={cn(
                'px-3 py-1 text-xs font-medium transition-all',
                mode === 'display'
                  ? 'bg-[var(--accent-leaf)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => onModeChange('display')}
            >
              Display
            </button>
          </div>
        )}

        <ShareLinkButton entityType="leaf" entityId={leaf.id} />

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Download className="h-3 w-3" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport('clipboard')} disabled={!leaf.output}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Output
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onExport('prompt')}
              disabled={!leaf.config?.prompt_template && !leaf.output}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              Copy as Prompt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('markdown')}>
              <FileText className="mr-2 h-4 w-4" />
              Export as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('json')}>
              <FileJson className="mr-2 h-4 w-4" />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
