'use client';

import { ClipboardPaste, Copy, Download, FileJson, FileText } from 'lucide-react';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { ShareLinkButton } from '@/components/shared/ShareLinkButton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkspaceMode } from '@/hooks/leaves/useLeafPageData';
import { useTerminology } from '@/hooks/shared/useTerminology';
import type { ExportFormat, Leaf } from '@/types/api';
import { cn } from '@/utils/cn';

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
  onExport,
  mode,
  onModeChange,
  className,
}: LeafWorkspaceHeaderProps) {
  const { t } = useTerminology();
  const shortHash = leaf.commit_hash.replace('sha256:', '').slice(0, 7);
  const generatedTime = leaf.generated_at ? formatDisplayTime(leaf.generated_at) : null;

  return (
    <header
      className={cn(
        'flex min-h-[58px] shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke-divider)] px-4 py-2',
        'bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)]',
        'backdrop-blur-[6px]',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="min-w-0">
          <Breadcrumb
            className="hidden min-w-0 text-[11px] md:flex"
            segments={[
              { label: 'Home', href: '/' },
              { label: 'Project', href: `/project/${projectId}` },
              {
                label: `${t('commit')} ${shortHash}`,
                href: `/project/${projectId}?focus=${leaf.commit_hash}`,
              },
              { label: 'Leaf' },
            ]}
          />
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-[15px] font-semibold leading-5 text-[var(--text-primary)]">
              {leaf.title || `Leaf ${leaf.id.slice(0, 9)}`}
            </h1>
            <span className="hidden shrink-0 font-mono text-[11px] text-[var(--text-tertiary)] sm:inline">
              {leaf.id.slice(0, 9)} · sha:{shortHash}
              {generatedTime ? ` · generated ${generatedTime}` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Mode toggle */}
        {mode && onModeChange && (
          <div className="mr-1 hidden overflow-hidden rounded-md border border-[var(--stroke-default)] sm:inline-flex md:mr-2">
            <button
              type="button"
              className={cn(
                'px-3 py-1 text-[10px] font-medium transition-all',
                mode === 'generate'
                  ? 'bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => onModeChange('generate')}
            >
              Generate
            </button>
            <button
              type="button"
              className={cn(
                'px-3 py-1 text-[10px] font-medium transition-all',
                mode === 'display'
                  ? 'bg-[var(--accent-leaf)]/10 text-[var(--accent-leaf)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => onModeChange('display')}
            >
              Display
            </button>
          </div>
        )}

        <ShareLinkButton entityType="leaf" entityId={leaf.id} className="h-8 rounded-lg text-xs" />

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Export</span>
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

function formatDisplayTime(value: string): string {
  const date = new Date(value);
  const hours = String((date.getUTCHours() + 8) % 24).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
