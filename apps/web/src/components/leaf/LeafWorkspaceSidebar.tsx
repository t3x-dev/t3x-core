'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle,
  ChevronDown,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
  Wrench,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { AssertionsSection } from '@/components/leaf/AssertionsSection';
import { ConstraintsSection } from '@/components/leaf/ConstraintsSection';
import { LeafConstraintSourceContext } from '@/components/leaf/LeafConstraintSourceContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Assertion, Constraint, Leaf } from '@/lib/api';
import { listLeavesByProject } from '@/lib/api/leaves';
import { cn } from '@/lib/utils';
import type { NodeWithSource } from '@/types/sourceContext';

// ============================================================================
// SidebarSection — lightweight collapsible (border-bottom divider style)
// ============================================================================

interface SidebarSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function SidebarSection({ title, icon, badge, defaultOpen = true, children }: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="border-b border-[var(--stroke-divider)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left select-none transition-colors hover:bg-[var(--hover-bg)]"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
          {badge}
        </div>
        <ChevronDown
          className={cn(
            'h-3 w-3 text-[var(--text-tertiary)] transition-transform duration-300',
            !open && '-rotate-90'
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// LeafWorkspaceSidebar
// ============================================================================

interface LeafWorkspaceSidebarProps {
  leaf: Leaf;
  nodes: NodeWithSource[];
  commitLoadError: boolean;
  hasCommitData: boolean;
  saving: boolean;
  // Constraint handlers
  onRemoveConstraint: (id: string) => void;
  onAddConstraint: (
    type: 'require' | 'exclude',
    value: string,
    matchMode?: 'exact' | 'semantic'
  ) => void;
  onAddConstraintFromSource: (
    type: 'require' | 'exclude',
    value: string,
    sourceNodeId: string
  ) => void;
  // Runner eval
  selectedAssertionIds: Set<string>;
  toggleAssertion: (id: string) => void;
  onRetune: () => Promise<void>;
  retuning: boolean;
  className?: string;
}

export function LeafWorkspaceSidebar({
  leaf,
  nodes,
  commitLoadError,
  hasCommitData,
  saving,
  onRemoveConstraint,
  onAddConstraint,
  onAddConstraintFromSource,
  selectedAssertionIds,
  toggleAssertion,
  onRetune,
  retuning,
  className,
}: LeafWorkspaceSidebarProps) {
  const requireCount = leaf.constraints.filter((c) => c.type === 'require').length;
  const excludeCount = leaf.constraints.filter((c) => c.type === 'exclude').length;
  const constraintBadge =
    leaf.constraints.length > 0 ? (
      <span className="text-[10px] text-[var(--text-tertiary)]">
        {requireCount} required &middot; {excludeCount} excluded
      </span>
    ) : null;

  const validationBadge = getValidationBadge(leaf.assertions);
  const runnerBadge = getRunnerBadge(leaf.runner_assertions);

  return (
    <aside
      className={cn(
        'hidden w-[340px] min-w-[340px] shrink-0 flex-col overflow-y-auto border-r md:flex',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]',
        className
      )}
    >
      {/* Constraints */}
      <SidebarSection
        title="Constraints"
        icon={<Shield className="h-3.5 w-3.5 text-[var(--accent-leaf)]" />}
        badge={constraintBadge}
      >
        <ConstraintsSection
          constraints={leaf.constraints}
          onRemove={onRemoveConstraint}
          onAdd={onAddConstraint}
          saving={saving}
        />
      </SidebarSection>

      {/* Validation Results */}
      <SidebarSection
        title="Validation"
        icon={<CheckCircle className="h-3.5 w-3.5 shrink-0 text-[var(--status-success)]" />}
        badge={validationBadge}
      >
        <CompactAssertions assertions={leaf.assertions} constraints={leaf.constraints} />
      </SidebarSection>

      {/* Source Context */}
      {hasCommitData && nodes.length > 0 && (
        <SidebarSection
          title="Source Context"
          icon={<MessageSquare className="h-3.5 w-3.5 text-[var(--accent-conversation)]" />}
          badge={
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {nodes.length} tree{nodes.length !== 1 ? 's' : ''}
            </span>
          }
          defaultOpen={false}
        >
          {commitLoadError && (
            <p className="mb-2 text-xs text-[var(--status-warning)]">
              Source commit data unavailable.
            </p>
          )}
          <LeafConstraintSourceContext
            nodes={nodes}
            constraints={leaf.constraints}
            onAdd={onAddConstraintFromSource}
            onRemove={onRemoveConstraint}
            saving={saving}
            compact
            hideChrome
          />
        </SidebarSection>
      )}

      {/* Runner Evaluation */}
      <SidebarSection
        title="Runner Eval"
        icon={<Wrench className="h-3.5 w-3.5 text-[var(--status-info)]" />}
        badge={runnerBadge}
        defaultOpen={false}
      >
        <CompactAssertions
          assertions={leaf.runner_assertions}
          constraints={leaf.constraints}
          selectedIds={selectedAssertionIds}
          onToggle={toggleAssertion}
          footer={
            leaf.runner_assertions && leaf.runner_assertions.length > 0 ? (
              <div className="mt-3 flex items-center gap-2 border-t border-[var(--stroke-divider)] pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={selectedAssertionIds.size === 0 || retuning || !leaf.commit_hash}
                  onClick={onRetune}
                >
                  {retuning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Re-tune
                  {selectedAssertionIds.size > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      {selectedAssertionIds.size}
                    </Badge>
                  )}
                </Button>
              </div>
            ) : undefined
          }
        />
      </SidebarSection>

      {/* Project Lessons */}
      <SidebarSection
        title="Project Lessons"
        icon={<BookOpen className="h-3.5 w-3.5 text-[var(--accent-amber)]" />}
        defaultOpen={false}
      >
        <ProjectLessons projectId={leaf.project_id} />
      </SidebarSection>
    </aside>
  );
}

// ============================================================================
// Compact sidebar-style assertions (no card wrapper)
// ============================================================================

function CompactAssertions({
  assertions,
  constraints,
  selectedIds,
  onToggle,
  footer,
}: {
  assertions: Assertion[] | null | undefined;
  constraints: Constraint[];
  selectedIds?: Set<string>;
  onToggle?: (id: string) => void;
  footer?: React.ReactNode;
}) {
  if (!assertions || assertions.length === 0) {
    return <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">No results yet.</p>;
  }

  return (
    <AssertionsSection
      assertions={assertions}
      constraints={constraints}
      selectedIds={selectedIds}
      onToggle={onToggle}
      footer={footer}
    />
  );
}

// ============================================================================
// Badge helpers
// ============================================================================

function getValidationBadge(assertions: Assertion[] | null | undefined): React.ReactNode {
  if (!assertions || assertions.length === 0) return null;
  const passed = assertions.filter((a) => a.passed).length;
  const allPassed = passed === assertions.length;
  return (
    <span
      className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        allPassed
          ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
          : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
      )}
    >
      {passed}/{assertions.length} passed
    </span>
  );
}

function getRunnerBadge(assertions: Assertion[] | null | undefined): React.ReactNode {
  if (!assertions || assertions.length === 0) return null;
  return (
    <span className="rounded-full bg-[var(--status-info-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--status-info)] border border-[var(--status-info)]/25">
      {assertions.length} assertion{assertions.length !== 1 ? 's' : ''}
    </span>
  );
}

// ============================================================================
// Project Lessons — aggregated failed-assertion lessons across all leaves
// ============================================================================

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function ProjectLessons({ projectId }: { projectId: string }) {
  const [lessons, setLessons] = useState<
    Array<{ lesson: string; count: number; lastSeen: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const leaves = await listLeavesByProject(projectId);
        const lessonMap = new Map<string, { count: number; lastSeen: string }>();
        for (const leaf of leaves) {
          for (const a of leaf.assertions ?? []) {
            if (!a.passed && a.lesson) {
              const existing = lessonMap.get(a.lesson);
              if (existing) {
                existing.count++;
                if (leaf.created_at && leaf.created_at > existing.lastSeen) {
                  existing.lastSeen = leaf.created_at;
                }
              } else {
                lessonMap.set(a.lesson, { count: 1, lastSeen: leaf.created_at ?? '' });
              }
            }
          }
        }
        if (!cancelled) {
          setLessons(
            [...lessonMap.entries()]
              .map(([lesson, data]) => ({ lesson, ...data }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
          );
        }
      } catch {
        // Silently fail — lessons are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading || lessons.length === 0) return null;

  return (
    <>
      {lessons.map((l) => (
        <div
          key={l.lesson}
          className="py-1.5 border-b border-[var(--stroke-divider)] last:border-0"
        >
          <p className="text-xs text-[var(--text-primary)]">{l.lesson}</p>
          <span className="text-[10px] text-[var(--text-tertiary)]">
            {l.count}&times; &middot; {formatTimeAgo(l.lastSeen)}
          </span>
        </div>
      ))}
      <p className="text-[10px] text-[var(--text-tertiary)] mt-2">
        These lessons are injected into future generations automatically.
      </p>
      <a
        href="/insights"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mt-1 block"
      >
        View all in Insights ↗
      </a>
    </>
  );
}
