'use client';

import { Check, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Constraint } from '@/lib/api';
import { cn } from '@/lib/utils';

// ============================================================================
// Constraints Section (chip/tag layout)
// ============================================================================

export interface ConstraintsSectionProps {
  constraints: Constraint[];
  onRemove: (id: string) => void;
  onAdd: (type: 'require' | 'exclude', value: string, matchMode?: 'exact' | 'semantic') => void;
  saving: boolean;
}

export function ConstraintsSection({
  constraints,
  onRemove,
  onAdd,
  saving,
}: ConstraintsSectionProps) {
  const [newConstraintValue, setNewConstraintValue] = useState('');
  const [newConstraintType, setNewConstraintType] = useState<'require' | 'exclude'>('require');
  const [showAddForm, setShowAddForm] = useState(false);

  const requireConstraints = constraints.filter((c) => c.type === 'require');
  const excludeConstraints = constraints.filter((c) => c.type === 'exclude');

  const handleAdd = () => {
    if (!newConstraintValue.trim()) return;
    onAdd(newConstraintType, newConstraintValue, 'exact');
    setNewConstraintValue('');
    setShowAddForm(false);
  };

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-[var(--space-group)]">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Constraints</h2>
          {constraints.length > 0 && (
            <span className="text-xs text-[var(--text-tertiary)]">
              {requireConstraints.length} required · {excludeConstraints.length} excluded
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
          disabled={saving}
          className="h-7 px-2 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      <div className="p-[var(--space-group)]">
        {/* Add constraint form */}
        {showAddForm && (
          <div className="mb-3 rounded-md border border-dashed p-3 space-y-2">
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs"
                value={newConstraintType}
                onChange={(e) => setNewConstraintType(e.target.value as 'require' | 'exclude')}
              >
                <option value="require">Must Have</option>
                <option value="exclude">Must Not Have</option>
              </select>
              <input
                type="text"
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                placeholder="Enter keyword or phrase..."
                value={newConstraintValue}
                onChange={(e) => setNewConstraintValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button size="sm" onClick={handleAdd} disabled={!newConstraintValue.trim() || saving}>
                Add
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Must Have chips */}
        {requireConstraints.length > 0 && (
          <div className="mb-2">
            <p className="text-xs font-medium text-[var(--status-success)] mb-1.5">Must Have</p>
            <div className="flex flex-wrap gap-1.5">
              {requireConstraints.map((c) => (
                <ConstraintChip
                  key={c.id}
                  constraint={c}
                  onRemove={() => onRemove(c.id)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>
        )}

        {/* Must Not Have chips */}
        {excludeConstraints.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--status-error)] mb-1.5">Must Not Have</p>
            <div className="flex flex-wrap gap-1.5">
              {excludeConstraints.map((c) => (
                <ConstraintChip
                  key={c.id}
                  constraint={c}
                  onRemove={() => onRemove(c.id)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>
        )}

        {constraints.length === 0 && !showAddForm && (
          <p className="text-xs text-[var(--text-tertiary)] text-center py-3">
            No constraints yet — add rules to control what appears in the output.
          </p>
        )}
      </div>
    </section>
  );
}

/** Compact chip for a single constraint */
function ConstraintChip({
  constraint,
  onRemove,
  disabled,
}: {
  constraint: Constraint;
  onRemove: () => void;
  disabled: boolean;
}) {
  const isRequire = constraint.type === 'require';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs max-w-[240px] transition-colors',
            isRequire
              ? 'bg-[var(--status-success-muted)] text-[var(--status-success)] border border-[var(--status-success)]/20'
              : 'bg-[var(--status-error-muted)] text-[var(--status-error)] border border-[var(--status-error)]/20'
          )}
        >
          {isRequire ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
          <span className="truncate">{constraint.value}</span>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="ml-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-[var(--text-primary)]"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-words text-xs">
        <p>{constraint.value}</p>
        {constraint.match_mode === 'semantic' && (
          <p className="mt-1 text-[var(--text-tertiary)]">Match: semantic</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
