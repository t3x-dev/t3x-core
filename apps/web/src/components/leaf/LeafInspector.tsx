'use client';

import type { SemanticContent } from '@t3x-dev/core';
import {
  Check,
  CheckCircle,
  Clipboard,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { LeafSemanticPointsPanel } from '@/components/leaf/LeafSemanticPointsPanel';
import { Button } from '@/components/ui/button';
import { deriveLeafSemanticPointItems } from '@/domain/leaf/semanticPoints';
import type { WorkspaceMode } from '@/hooks/leaves/useLeafPageData';
import type { Assertion, Constraint, Leaf } from '@/types/api';
import { cn } from '@/utils/cn';

// ============================================================================
// Types
// ============================================================================

interface LeafInspectorProps {
  leaf: Leaf;
  semanticContent: SemanticContent | null;
  mode: WorkspaceMode;
  saving: boolean;
  savingSemanticPoints: boolean;
  collapsed: boolean;
  onRemoveConstraint: (id: string) => void;
  onAddConstraint: (
    type: 'require' | 'exclude',
    value: string,
    matchMode?: 'exact' | 'semantic'
  ) => void;
  onExport: (format: 'clipboard' | 'markdown' | 'json' | 'prompt') => Promise<void>;
  // Runner Eval
  selectedAssertionIds?: Set<string>;
  toggleAssertion?: (id: string) => void;
  onRetune?: () => Promise<void>;
  retuning?: boolean;
  onToggleSemanticPoint: (pointId: string, included: boolean) => void;
}

// ============================================================================
// ConstraintPill
// ============================================================================

function ConstraintPill({
  constraint,
  editable,
  onRemove,
  disabled,
}: {
  constraint: Constraint;
  editable: boolean;
  onRemove: () => void;
  disabled: boolean;
}) {
  const isRequire = constraint.type === 'require';
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
        isRequire
          ? 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]'
          : 'border-[var(--status-error)]/25 bg-[var(--status-error-muted)] text-[var(--status-error)]'
      )}
    >
      {isRequire ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
      <span className="flex-1 truncate font-medium">{constraint.value}</span>
      {editable && (
        <button
          type="button"
          aria-label={`Remove constraint: ${constraint.value.slice(0, 50)}`}
          className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// AddConstraintInline
// ============================================================================

function AddConstraintInline({
  onAdd,
  saving,
}: {
  onAdd: (type: 'require' | 'exclude', value: string) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [type, setType] = useState<'require' | 'exclude'>('require');

  const handleSubmit = useCallback(() => {
    if (!value.trim()) return;
    onAdd(type, value.trim());
    setValue('');
    setOpen(false);
  }, [value, type, onAdd]);

  if (!open) {
    return (
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[var(--stroke-default)] py-1.5 text-[11px] font-medium text-[var(--accent-leaf)] hover:border-[var(--accent-leaf)] hover:bg-[var(--surface-elevated)] transition-colors"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3" />
        Add constraint
      </button>
    );
  }

  return (
    <div className="rounded-md border border-[var(--accent-leaf)] p-2 space-y-2">
      <div className="flex gap-1">
        <button
          type="button"
          className={cn(
            'flex-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors',
            type === 'require'
              ? 'bg-[var(--accent-leaf)] text-white'
              : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
          )}
          onClick={() => setType('require')}
        >
          Require
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors',
            type === 'exclude'
              ? 'bg-[var(--status-error)] text-white'
              : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
          )}
          onClick={() => setType('exclude')}
        >
          Exclude
        </button>
      </div>
      <input
        type="text"
        className="w-full rounded border border-[var(--stroke-default)] bg-transparent px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-leaf)]"
        placeholder="Constraint value..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 flex-1 text-[10px]"
          onClick={handleSubmit}
          disabled={saving || !value.trim()}
        >
          Add
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px]"
          onClick={() => {
            setOpen(false);
            setValue('');
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// AssertionRow
// ============================================================================

function AssertionRow({
  assertion,
  constraint,
  expanded,
}: {
  assertion: Assertion;
  constraint?: Constraint;
  expanded: boolean;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-1.5 text-xs">
        {assertion.passed ? (
          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-[var(--status-success)]" />
        ) : (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-[var(--status-error)]" />
        )}
        <span
          className={cn(
            'flex-1',
            assertion.passed ? 'text-[var(--text-secondary)]' : 'text-[var(--status-error)]'
          )}
        >
          {constraint?.value ?? assertion.constraint_id}: {assertion.passed ? 'found' : 'missing'}
        </span>
      </div>
      {expanded && assertion.details && (
        <p className="ml-5 mt-0.5 text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          {assertion.details}
        </p>
      )}
      {expanded && assertion.lesson && (
        <p className="ml-5 mt-0.5 text-[10px] text-[var(--status-warning)] leading-relaxed">
          Lesson: {assertion.lesson}
        </p>
      )}
    </div>
  );
}

// ============================================================================
// LeafInspector
// ============================================================================

export function LeafInspector({
  leaf,
  semanticContent,
  mode,
  saving,
  savingSemanticPoints,
  collapsed,
  onRemoveConstraint,
  onAddConstraint,
  onExport,
  selectedAssertionIds,
  toggleAssertion,
  onRetune,
  retuning,
  onToggleSemanticPoint,
}: LeafInspectorProps) {
  const editable = mode === 'generate';
  const semanticPoints = useMemo(
    () => (semanticContent ? deriveLeafSemanticPointItems(semanticContent, leaf.config) : []),
    [semanticContent, leaf.config]
  );
  const requireConstraints = leaf.constraints.filter((c) => c.type === 'require');
  const excludeConstraints = leaf.constraints.filter((c) => c.type === 'exclude');
  const assertions = leaf.assertions ?? [];
  const passedCount = assertions.filter((a) => a.passed).length;
  const constraintMap = new Map(leaf.constraints.map((c) => [c.id, c]));

  if (collapsed) return null;

  return (
    <aside
      className={cn(
        'w-[280px] min-w-[280px] shrink-0 flex-col overflow-y-auto border-l flex',
        'bg-[color-mix(in_srgb,var(--surface-panel)_88%,transparent)]',
        'backdrop-blur-[var(--fx-blur-panel)]'
      )}
    >
      {semanticContent && (
        <LeafSemanticPointsPanel
          points={semanticPoints}
          saving={savingSemanticPoints}
          onTogglePoint={onToggleSemanticPoint}
        />
      )}

      {/* Constraints */}
      <div className="p-3 border-b border-[var(--stroke-divider)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Constraints
          </span>
          <span className="text-[10px] text-[var(--text-tertiary)]">{leaf.constraints.length}</span>
        </div>

        {/* Require */}
        {requireConstraints.length > 0 && (
          <div className="mb-2">
            <span className="text-[10px] font-semibold text-[var(--status-success)] uppercase tracking-wide">
              Require
            </span>
            <div className="mt-1 flex flex-col gap-1">
              {requireConstraints.map((c) => (
                <ConstraintPill
                  key={c.id}
                  constraint={c}
                  editable={editable}
                  onRemove={() => onRemoveConstraint(c.id)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>
        )}

        {/* Exclude */}
        {excludeConstraints.length > 0 && (
          <div className="mb-2">
            <span className="text-[10px] font-semibold text-[var(--status-error)] uppercase tracking-wide">
              Exclude
            </span>
            <div className="mt-1 flex flex-col gap-1">
              {excludeConstraints.map((c) => (
                <ConstraintPill
                  key={c.id}
                  constraint={c}
                  editable={editable}
                  onRemove={() => onRemoveConstraint(c.id)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>
        )}

        {/* Add constraint (Generate mode only) */}
        {editable && (
          <AddConstraintInline
            onAdd={(type, value) => onAddConstraint(type, value)}
            saving={saving}
          />
        )}
      </div>

      {/* Assertions */}
      <div className="p-3 border-b border-[var(--stroke-divider)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Assertions
          </span>
          {assertions.length > 0 && (
            <span
              className={cn(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                passedCount === assertions.length
                  ? 'bg-[var(--status-success-muted)] text-[var(--status-success)]'
                  : 'bg-[var(--status-error-muted)] text-[var(--status-error)]'
              )}
            >
              {passedCount}/{assertions.length}
            </span>
          )}
        </div>

        {assertions.length === 0 ? (
          <p className="py-2 text-center text-[10px] text-[var(--text-tertiary)]">
            No results yet.
          </p>
        ) : (
          <div>
            {assertions.map((a) => (
              <AssertionRow
                key={a.id}
                assertion={a}
                constraint={constraintMap.get(a.constraint_id)}
                expanded={mode === 'display'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Runner Eval / Re-tune */}
      {leaf.runner_assertions && leaf.runner_assertions.length > 0 && toggleAssertion && (
        <div className="p-3 border-b border-[var(--stroke-divider)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Runner Eval
            </span>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {leaf.runner_assertions.filter((a) => !a.passed).length} failed
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {leaf.runner_assertions.map((a) => (
              <label
                key={a.id}
                className={cn(
                  'flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] cursor-pointer transition-colors',
                  selectedAssertionIds?.has(a.id)
                    ? 'bg-[var(--surface-elevated)]'
                    : 'hover:bg-[var(--surface-elevated)]'
                )}
              >
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-[var(--accent-leaf)]"
                  checked={selectedAssertionIds?.has(a.id) ?? false}
                  onChange={() => toggleAssertion(a.id)}
                />
                <span
                  className={cn(
                    'flex-1 truncate',
                    a.passed ? 'text-[var(--text-secondary)]' : 'text-[var(--status-error)]'
                  )}
                >
                  {a.details || a.constraint_id}
                </span>
                {a.passed ? (
                  <CheckCircle className="h-3 w-3 shrink-0 text-[var(--status-success)]" />
                ) : (
                  <XCircle className="h-3 w-3 shrink-0 text-[var(--status-error)]" />
                )}
              </label>
            ))}
          </div>
          {onRetune && selectedAssertionIds && selectedAssertionIds.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full h-7 text-[10px] gap-1"
              onClick={onRetune}
              disabled={retuning}
            >
              {retuning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Re-tune ({selectedAssertionIds.size})
            </Button>
          )}
        </div>
      )}

      {/* Deploy & Share */}
      <div className="p-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 block">
          Deploy & Share
        </span>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:bg-[var(--surface-elevated)] transition-all"
            onClick={() => onExport('clipboard')}
            disabled={!leaf.output}
          >
            <Clipboard className="h-3.5 w-3.5 shrink-0" />
            Copy to clipboard
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:bg-[var(--surface-elevated)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onExport('json')}
            disabled={!leaf.output}
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            Share via API
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)] px-2.5 py-2 text-xs text-[var(--text-secondary)] hover:border-[var(--stroke-strong)] hover:bg-[var(--surface-elevated)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => onExport('markdown')}
            disabled={!leaf.output}
          >
            <Mail className="h-3.5 w-3.5 shrink-0" />
            Export Markdown
          </button>
        </div>
      </div>
    </aside>
  );
}
