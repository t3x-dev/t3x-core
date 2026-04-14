'use client';

/**
 * DraftConstraintEditor - Constraint editor with local validation results
 *
 * Lists constraints with type badges (require=green, exclude=red),
 * shows inline validation results, and allows adding/removing constraints.
 */

import { Check, Plus, ShieldCheck, ShieldX, X } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ValidationResult } from '@/domain/draft/validation';
import { useDraftWorkspaceStore } from '@/store/draftWorkspaceStore';
import type { DraftConstraint } from '@/types/api';

export function DraftConstraintEditor() {
  const { draft, validationResults, addConstraint, removeConstraint } = useDraftWorkspaceStore();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'require' | 'exclude'>('require');
  const [matchMode, setMatchMode] = useState<'exact' | 'semantic'>('exact');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  if (!draft) return null;

  const handleAdd = () => {
    if (!value.trim()) return;
    addConstraint(type, matchMode, value, type === 'exclude' ? reason : undefined);
    setValue('');
    setReason('');
    setShowForm(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Escape') {
      setShowForm(false);
    }
  };

  const getValidation = (constraintId: string): ValidationResult | undefined =>
    validationResults.find((v) => v.constraint_id === constraintId);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Constraints
          {draft.constraints.length > 0 && (
            <span className="ml-1.5 text-muted-foreground font-normal">
              ({draft.constraints.length})
            </span>
          )}
        </h2>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add Constraint
          </Button>
        )}
      </div>

      {/* Constraint list */}
      {draft.constraints.length > 0 && (
        <div className="space-y-2 mb-3">
          {draft.constraints.map((constraint) => (
            <ConstraintRow
              key={constraint.id}
              constraint={constraint}
              validation={getValidation(constraint.id)}
              onRemove={() => removeConstraint(constraint.id)}
            />
          ))}
        </div>
      )}

      {/* Add form (inline) */}
      {showForm && (
        <div className="rounded-lg border border-border p-3 space-y-3 bg-[var(--surface-card)]">
          <div className="flex items-center gap-2">
            <Select value={type} onValueChange={(v) => setType(v as 'require' | 'exclude')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="require">Must Have</SelectItem>
                <SelectItem value="exclude">Must Not Have</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={matchMode}
              onValueChange={(v) => setMatchMode(v as 'exact' | 'semantic')}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact">Exact</SelectItem>
                <SelectItem value="semantic">Semantic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Constraint value..."
            autoFocus
          />

          {type === 'exclude' && (
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
            />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!value.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {draft.constraints.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground">
          No constraints. Add constraints to validate the draft content.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ConstraintRow
// ---------------------------------------------------------------------------

function ConstraintRow({
  constraint,
  validation,
  onRemove,
}: {
  constraint: DraftConstraint;
  validation?: ValidationResult;
  onRemove: () => void;
}) {
  const isRequire = constraint.type === 'require';

  return (
    <div className="group flex items-center gap-2 rounded-lg border border-border p-2 bg-[var(--surface-card)]">
      {/* Type icon */}
      {isRequire ? (
        <ShieldCheck className="h-4 w-4 text-[var(--status-success)] shrink-0" />
      ) : (
        <ShieldX className="h-4 w-4 text-[var(--status-error)] shrink-0" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={
              isRequire
                ? 'border-[var(--status-success)]/50 text-[var(--status-success)] text-xs'
                : 'border-[var(--status-error)]/50 text-[var(--status-error)] text-xs'
            }
          >
            {isRequire ? 'require' : 'exclude'}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {constraint.match_mode}
          </Badge>
          <span className="text-sm truncate">{constraint.value}</span>
        </div>
        {constraint.reason && (
          <p className="text-xs text-muted-foreground mt-0.5">{constraint.reason}</p>
        )}
      </div>

      {/* Validation result */}
      {validation && <ValidationBadge validation={validation} />}

      {/* Remove */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Remove constraint"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ValidationBadge({ validation }: { validation: ValidationResult }) {
  if (validation.passed) {
    return (
      <span
        className="flex items-center gap-1 text-xs text-[var(--status-success)]"
        title={validation.details}
      >
        <Check className="h-3 w-3" />
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1 text-xs text-[var(--status-error)]"
      title={validation.details}
    >
      <X className="h-3 w-3" />
    </span>
  );
}
