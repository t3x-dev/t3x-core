'use client';

import {
  Brain,
  History,
  Import,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import type React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PathHighlight } from '@/hooks/usePathHighlight';
import { useTerminology } from '@/hooks/useTerminology';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface CanvasToolbarProps {
  projectName: string;
  projectId: string | null;
  mode: 'editor' | 'execution';
  onModeChange: (mode: 'editor' | 'execution') => void;
  viewSwitcher?: React.ReactNode;
  /** Path highlight state */
  highlight: PathHighlight;
  toggleHighlight: (mode: PathHighlight) => void;
  setHighlight: React.Dispatch<React.SetStateAction<PathHighlight>>;
  /** Branch filter */
  branchFilter: string;
  setBranchFilter: (value: string) => void;
  branchNames: string[];
  hasMainCommits: boolean;
  hasBranchCommits: boolean;
  /** Action callbacks */
  onShowMemoryModal: () => void;
  onShowImportDialog: () => void;
  onAutoLayout: () => void;
  onAddNode: () => void;
  /** Loading states */
  isLayouting: boolean;
  isPending: boolean;
  nodeCount: number;
}

export function CanvasToolbar({
  projectName,
  projectId,
  mode,
  onModeChange,
  viewSwitcher,
  highlight,
  toggleHighlight,
  setHighlight,
  branchFilter,
  setBranchFilter,
  branchNames,
  hasMainCommits,
  hasBranchCommits,
  onShowMemoryModal,
  onShowImportDialog,
  onAutoLayout,
  onAddNode,
  isLayouting,
  isPending,
  nodeCount,
}: CanvasToolbarProps) {
  const { t } = useTerminology();

  return (
    <>
      {/* Integrated Top Bar - Glass style */}
      <header
        className={cn(
          'flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-5',
          glass.panelBase,
          glass.highlight
        )}
      >
        <div className="flex items-center gap-5">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{projectName}</h2>
          <div className="h-5 w-px bg-border/60" />
          <div className="flex items-center gap-1">
            <Button
              variant={highlight?.mode === 'main' ? 'commit' : 'ghost'}
              size="sm"
              onClick={() => toggleHighlight({ mode: 'main' })}
              disabled={!hasMainCommits}
              className={cn(
                'h-7 px-3 text-xs font-medium rounded-full transition-all',
                highlight?.mode !== 'main' &&
                  'text-[var(--text-secondary)] hover:text-foreground hover:bg-muted'
              )}
            >
              Main
            </Button>
            <Button
              variant={highlight?.mode === 'branch' ? 'pending' : 'ghost'}
              size="sm"
              onClick={() =>
                hasBranchCommits &&
                toggleHighlight({
                  mode: 'branch',
                  branch: branchFilter === 'all' ? undefined : branchFilter,
                })
              }
              disabled={!hasBranchCommits}
              className={cn(
                'h-7 px-3 text-xs font-medium rounded-full transition-all',
                highlight?.mode !== 'branch' &&
                  'text-[var(--text-secondary)] hover:text-foreground hover:bg-muted'
              )}
            >
              Branch
            </Button>
            <Select
              value={branchFilter}
              onValueChange={(value) => {
                setBranchFilter(value);
                if (highlight?.mode === 'branch') {
                  setHighlight({
                    mode: 'branch',
                    branch: value === 'all' ? undefined : value,
                  });
                }
              }}
              disabled={!hasBranchCommits}
            >
              <SelectTrigger className="h-7 w-[130px] text-xs rounded-full border-border/50 bg-muted/50 hover:bg-muted transition-colors">
                <SelectValue placeholder={t('all_branches')} />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">{t('all_branches')}</SelectItem>
                {branchNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {viewSwitcher}
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowMemoryModal}
            title="Memory Context"
            data-action="memory"
            className={cn(
              'h-9 px-3 rounded-xl transition-all text-xs gap-1.5',
              'text-[var(--text-secondary)] hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary'
            )}
          >
            <Brain className="h-4 w-4" />
            Memory
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onShowImportDialog}
            title="Import"
            className={cn(
              'h-9 w-9 rounded-xl transition-all',
              'text-[var(--text-secondary)] hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary'
            )}
          >
            <Import className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onAutoLayout}
            title="Auto Layout"
            className={cn(
              'h-9 w-9 rounded-xl transition-all',
              'text-[var(--text-secondary)] hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary',
              isLayouting && 'pointer-events-none'
            )}
            disabled={isLayouting || nodeCount === 0}
          >
            {isLayouting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LayoutGrid className="h-4 w-4" />
            )}
          </Button>
          <Link
            href={`/project/${projectId}/history`}
            title="Commit History"
            className={cn(
              'inline-flex items-center justify-center h-9 w-9 rounded-xl transition-all',
              'text-[var(--text-secondary)] hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary'
            )}
          >
            <History className="h-4 w-4" />
          </Link>
          <Link
            href={`/project/${projectId}/settings`}
            title="Project Settings"
            className={cn(
              'inline-flex items-center justify-center h-9 w-9 rounded-xl transition-all',
              'text-[var(--text-secondary)] hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary'
            )}
          >
            <Settings className="h-4 w-4" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={onAddNode}
            title="Add Unit"
            className={cn(
              'h-9 w-9 rounded-xl transition-all',
              'text-[var(--text-secondary)] hover:text-foreground',
              'hover:bg-primary/10 hover:text-primary',
              isPending && 'pointer-events-none'
            )}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      {/* Mode Switch - using shadcn Tabs with pill variant */}
      <div className="absolute left-1/2 top-14 z-10 -translate-x-1/2 -translate-y-1/2">
        <Tabs value={mode} onValueChange={(v) => onModeChange(v as 'editor' | 'execution')}>
          <TabsList variant="pill">
            <TabsTrigger value="editor" variant="pill">
              Editor
            </TabsTrigger>
            <TabsTrigger value="execution" variant="pill">
              Execution
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </>
  );
}
