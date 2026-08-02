'use client';

import {
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  FileJson,
  FileOutput,
  FileText,
  Layers3,
  Plus,
} from 'lucide-react';
import { Breadcrumb } from '@/components/shared/Breadcrumb';
import { ShareLinkButton } from '@/components/shared/ShareLinkButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { commitHashLabel, shortHash as formatShortHash } from '@/domain/format/formatters';
import { getProjectRepoPath } from '@/domain/project/repoPath';
import type { WorkspaceMode } from '@/hooks/leaves/useLeafPageData';
import { useTerminology } from '@/hooks/shared/useTerminology';
import type { ExportFormat, Leaf } from '@/types/api';
import { cn } from '@/utils/cn';

export interface EmbeddedLeafNavigation {
  count: number;
  onCreateLeaf: () => void;
  onManageLeaves: () => void;
  status: {
    label: string;
    variant: 'leaf' | 'pending' | 'warning' | 'outline';
  };
}

interface LeafWorkspaceHeaderProps {
  embeddedNavigation?: EmbeddedLeafNavigation;
  leaf: Leaf;
  projectId: string;
  projectName: string | undefined;
  onExport: (format: ExportFormat) => Promise<void>;
  mode?: WorkspaceMode;
  onModeChange?: (mode: WorkspaceMode) => void;
  className?: string;
}

export function LeafWorkspaceHeader({
  embeddedNavigation,
  leaf,
  projectId,
  projectName,
  onExport,
  mode,
  onModeChange,
  className,
}: LeafWorkspaceHeaderProps) {
  const { t } = useTerminology();
  const shortHash = formatShortHash(leaf.commit_hash);
  const hashLabel = commitHashLabel(leaf.commit_hash);
  const generatedTime = leaf.generated_at ? formatDisplayTime(leaf.generated_at) : null;
  const repoPath = projectName ? getProjectRepoPath({ id: projectId, name: projectName }) : null;

  return (
    <header
      className={cn(
        'relative flex shrink-0 items-center justify-between gap-4 border-b border-[var(--stroke-divider)]',
        embeddedNavigation ? 'min-h-12 px-3 py-2' : 'min-h-[58px] px-4 py-2',
        'bg-[color-mix(in_srgb,var(--surface-panel)_90%,transparent)]',
        'backdrop-blur-[6px]',
        className
      )}
      data-intro-target="leaf-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {embeddedNavigation ? (
          <>
            <Button
              aria-label={`Manage Leaves, ${embeddedNavigation.count} existing`}
              className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={embeddedNavigation.onManageLeaves}
              size="sm"
              type="button"
              variant="outline"
            >
              <Layers3 aria-hidden="true" className="size-3.5 text-[var(--accent-commit)]" />
              <span className="hidden sm:inline">Leaves</span>
              <Badge className="h-5 min-w-5 justify-center px-1.5" variant="outline">
                {embeddedNavigation.count}
              </Badge>
              <ChevronDown aria-hidden="true" className="size-3 text-[var(--text-tertiary)]" />
            </Button>
            <span aria-hidden="true" className="h-7 w-px shrink-0 bg-[var(--stroke-divider)]" />
          </>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="min-w-0">
            {!embeddedNavigation ? (
              <Breadcrumb
                className="hidden min-w-0 text-[11px] md:flex"
                segments={[
                  { label: 'Home', href: '/' },
                  { label: 'Project', href: repoPath ?? undefined },
                  {
                    label: `${t('commit')} ${shortHash}`,
                    href: repoPath
                      ? `${repoPath}?view=canvas&commit=${encodeURIComponent(leaf.commit_hash)}`
                      : undefined,
                  },
                  { label: 'Leaf' },
                ]}
              />
            ) : null}
            <div className="flex min-w-0 items-center gap-2">
              {embeddedNavigation ? (
                <span className="hidden size-8 shrink-0 items-center justify-center rounded-md border border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)] md:flex">
                  <FileOutput aria-hidden="true" className="size-4" />
                </span>
              ) : null}
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-[15px] font-semibold leading-5 text-[var(--text-primary)]">
                    {leaf.title || `Leaf ${leaf.id.slice(0, 9)}`}
                  </h1>
                  {embeddedNavigation ? (
                    <Badge
                      className="hidden shrink-0 sm:inline-flex"
                      variant={embeddedNavigation.status.variant}
                    >
                      {embeddedNavigation.status.label}
                    </Badge>
                  ) : null}
                </div>
                <span className="hidden truncate font-mono text-[11px] text-[var(--text-tertiary)] sm:block">
                  {leaf.id.slice(0, 9)} · {hashLabel}
                  {generatedTime ? ` · generated ${generatedTime}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5" data-intro-target="leaf-actions">
        {/* Mode toggle */}
        {mode && onModeChange && (
          <div
            aria-label="Leaf workspace mode"
            className="mr-1 hidden overflow-hidden rounded-md border border-[var(--stroke-default)] sm:inline-flex md:mr-2"
            role="tablist"
          >
            <button
              aria-selected={mode === 'generate'}
              type="button"
              role="tab"
              data-intro-target="leaf-mode-generate"
              className={cn(
                'min-h-8 px-3 py-1 text-xs font-medium transition-all',
                mode === 'generate'
                  ? 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => onModeChange('generate')}
            >
              Generate
            </button>
            <button
              aria-selected={mode === 'display'}
              type="button"
              role="tab"
              data-intro-target="leaf-mode-display"
              className={cn(
                'min-h-8 px-3 py-1 text-xs font-medium transition-all',
                mode === 'display'
                  ? 'bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              )}
              onClick={() => onModeChange('display')}
            >
              Display
            </button>
          </div>
        )}

        {leaf.output ? (
          <ShareLinkButton
            entityType="leaf"
            entityId={leaf.id}
            className="h-8 rounded-md text-xs"
          />
        ) : null}

        {/* Export dropdown */}
        {leaf.output ? (
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
        ) : null}

        {embeddedNavigation ? (
          <Button
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={embeddedNavigation.onCreateLeaf}
            size="sm"
            type="button"
            variant="branch"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            <span className="hidden lg:inline">New Leaf</span>
          </Button>
        ) : null}
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
