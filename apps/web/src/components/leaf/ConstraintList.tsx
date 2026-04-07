import { CheckCircle, Trash2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Constraint } from '@/lib/api';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════
// ConstraintList — displays grouped require/exclude constraints
// ═══════════════════════════════════════════════════════════════════════════

export function ConstraintList({
  constraints,
  onRemove,
  onHover,
  saving,
}: {
  constraints: Constraint[];
  onRemove?: (id: string) => void;
  onHover: (id: string | null) => void;
  saving?: boolean;
}) {
  const requireConstraints = constraints.filter((c) => c.type === 'require');
  const excludeConstraints = constraints.filter((c) => c.type === 'exclude');

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3">
      {requireConstraints.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--status-success)] uppercase tracking-wide mb-1.5">
            Must Have ({requireConstraints.length})
          </h4>
          <div className="space-y-1">
            {requireConstraints.map((c) => (
              <ConstraintRow
                key={c.id}
                constraint={c}
                onRemove={onRemove ? () => onRemove(c.id) : undefined}
                onHover={onHover}
                disabled={saving}
              />
            ))}
          </div>
        </div>
      )}
      {excludeConstraints.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-[var(--status-error)] uppercase tracking-wide mb-1.5">
            Must Not Have ({excludeConstraints.length})
          </h4>
          <div className="space-y-1">
            {excludeConstraints.map((c) => (
              <ConstraintRow
                key={c.id}
                constraint={c}
                onRemove={onRemove ? () => onRemove(c.id) : undefined}
                onHover={onHover}
                disabled={saving}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ConstraintRow — single constraint display with delete button
// ═══════════════════════════════════════════════════════════════════════════

export function ConstraintRow({
  constraint,
  onRemove,
  onHover,
  disabled,
}: {
  constraint: Constraint;
  onRemove?: () => void;
  onHover: (id: string | null) => void;
  disabled?: boolean;
}) {
  const isRequire = constraint.type === 'require';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
        isRequire
          ? 'border-[var(--status-success)]/20 bg-[var(--status-success-muted)]'
          : 'border-[var(--status-error)]/20 bg-[var(--status-error-muted)]'
      )}
      onMouseEnter={() => onHover(constraint.id)}
      onMouseLeave={() => onHover(null)}
    >
      {isRequire ? (
        <CheckCircle className="h-3.5 w-3.5 text-[var(--status-success)] shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-[var(--status-error)] shrink-0" />
      )}
      <span
        className={cn(
          'flex-1 truncate font-medium',
          isRequire ? 'text-[var(--status-success)]' : 'text-[var(--status-error)]'
        )}
      >
        {constraint.value}
      </span>
      <span className="text-xs px-1.5 py-0.5 bg-[var(--color-bg-white)]/60 rounded text-[var(--color-text-muted)]">
        {constraint.match_mode}
      </span>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={onRemove}
          disabled={disabled}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
