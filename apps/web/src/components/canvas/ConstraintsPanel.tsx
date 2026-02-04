import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Plus, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Clause, ConversationConstraints, DraftConstraintOverrides } from '@/types/nodes';

interface ConstraintsPanelProps {
  constraints: {
    clauses: ConversationConstraints['clauses'];
    must_have: string[];
    mustnt_have: string[];
  };
  overrides?: DraftConstraintOverrides;
  onUpdateOverrides?: (overrides: Partial<DraftConstraintOverrides>) => void;
}

export default function ConstraintsPanel({
  constraints,
  overrides,
  onUpdateOverrides,
}: ConstraintsPanelProps) {
  const [expandedSections, setExpandedSections] = useState({
    clauses: true,
    mustHave: true,
    mustntHave: true,
  });
  const [newMustHave, setNewMustHave] = useState('');
  const [newMustntHave, setNewMustntHave] = useState('');

  const toggleSection = (section: 'clauses' | 'mustHave' | 'mustntHave') => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Check if a clause is disabled
  const isClauseDisabled = useCallback(
    (clauseId: string) => {
      return overrides?.disabledClauseIds?.includes(clauseId) ?? false;
    },
    [overrides]
  );

  // Toggle clause enabled/disabled
  const toggleClause = useCallback(
    (clauseId: string) => {
      if (!onUpdateOverrides) return;
      const currentDisabled = overrides?.disabledClauseIds ?? [];
      const isDisabled = currentDisabled.includes(clauseId);
      const newDisabled = isDisabled
        ? currentDisabled.filter((id) => id !== clauseId)
        : [...currentDisabled, clauseId];
      onUpdateOverrides({ disabledClauseIds: newDisabled });
    },
    [overrides, onUpdateOverrides]
  );

  // Check if a must-have keyword is removed
  const isMustHaveRemoved = useCallback(
    (keyword: string) => {
      return overrides?.removedMustHave?.includes(keyword) ?? false;
    },
    [overrides]
  );

  // Toggle must-have keyword
  const toggleMustHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return;
      const currentRemoved = overrides?.removedMustHave ?? [];
      const isRemoved = currentRemoved.includes(keyword);
      const newRemoved = isRemoved
        ? currentRemoved.filter((k) => k !== keyword)
        : [...currentRemoved, keyword];
      onUpdateOverrides({ removedMustHave: newRemoved });
    },
    [overrides, onUpdateOverrides]
  );

  // Check if a mustn't-have keyword is removed
  const isMustntHaveRemoved = useCallback(
    (keyword: string) => {
      return overrides?.removedMustntHave?.includes(keyword) ?? false;
    },
    [overrides]
  );

  // Toggle mustn't-have keyword
  const toggleMustntHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return;
      const currentRemoved = overrides?.removedMustntHave ?? [];
      const isRemoved = currentRemoved.includes(keyword);
      const newRemoved = isRemoved
        ? currentRemoved.filter((k) => k !== keyword)
        : [...currentRemoved, keyword];
      onUpdateOverrides({ removedMustntHave: newRemoved });
    },
    [overrides, onUpdateOverrides]
  );

  // Add new must-have keyword
  const addMustHave = useCallback(() => {
    const trimmed = newMustHave.trim();
    if (!trimmed || !onUpdateOverrides) return;
    const current = overrides?.additionalMustHave ?? [];
    if (!current.includes(trimmed) && !constraints.must_have.includes(trimmed)) {
      onUpdateOverrides({ additionalMustHave: [...current, trimmed] });
    }
    setNewMustHave('');
  }, [newMustHave, overrides, constraints.must_have, onUpdateOverrides]);

  // Remove additional must-have keyword
  const removeAdditionalMustHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return;
      const current = overrides?.additionalMustHave ?? [];
      onUpdateOverrides({ additionalMustHave: current.filter((k) => k !== keyword) });
    },
    [overrides, onUpdateOverrides]
  );

  // Add new mustn't-have keyword
  const addMustntHave = useCallback(() => {
    const trimmed = newMustntHave.trim();
    if (!trimmed || !onUpdateOverrides) return;
    const current = overrides?.additionalMustntHave ?? [];
    if (!current.includes(trimmed) && !constraints.mustnt_have.includes(trimmed)) {
      onUpdateOverrides({ additionalMustntHave: [...current, trimmed] });
    }
    setNewMustntHave('');
  }, [newMustntHave, overrides, constraints.mustnt_have, onUpdateOverrides]);

  // Remove additional mustn't-have keyword
  const removeAdditionalMustntHave = useCallback(
    (keyword: string) => {
      if (!onUpdateOverrides) return;
      const current = overrides?.additionalMustntHave ?? [];
      onUpdateOverrides({ additionalMustntHave: current.filter((k) => k !== keyword) });
    },
    [overrides, onUpdateOverrides]
  );

  // Get active clauses (keep status only, not disabled)
  const activeClauses = constraints.clauses.filter(
    (c) => c.status === 'keep' && !isClauseDisabled(c.id)
  );
  const totalKeepClauses = constraints.clauses.filter((c) => c.status === 'keep').length;

  // Get active must-have keywords
  const activeMustHave = [
    ...constraints.must_have.filter((kw) => !isMustHaveRemoved(kw)),
    ...(overrides?.additionalMustHave ?? []),
  ];

  // Get active mustn't-have keywords
  const activeMustntHave = [
    ...constraints.mustnt_have.filter((kw) => !isMustntHaveRemoved(kw)),
    ...(overrides?.additionalMustntHave ?? []),
  ];

  return (
    <div className="mt-5 border-t pt-5">
      <div className="mb-4">
        <strong className="mb-1 block text-base text-foreground">Constraints</strong>
        <span className="text-sm text-muted-foreground">From Conversation</span>
      </div>

      {/* Clauses Section */}
      <div className="mb-4">
        <Button
          variant="ghost"
          className="flex w-full items-center justify-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => toggleSection('clauses')}
        >
          {expandedSections.clauses ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>Sentence Candidates</span>
          <Badge variant="secondary" className="ml-auto">
            {activeClauses.length}/{totalKeepClauses}
          </Badge>
        </Button>
        {expandedSections.clauses && (
          <div className="pt-3 space-y-2">
            {constraints.clauses
              .filter((c) => c.status === 'keep')
              .map((clause) => (
                <ClauseItem
                  key={clause.id}
                  clause={clause}
                  isDisabled={isClauseDisabled(clause.id)}
                  onToggle={() => toggleClause(clause.id)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
            {totalKeepClauses === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No sentences marked as "keep" in Conversation.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Must-Have Section */}
      <div className="mb-4">
        <Button
          variant="ghost"
          className="flex w-full items-center justify-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => toggleSection('mustHave')}
        >
          {expandedSections.mustHave ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
          <span>Must-Have Keywords</span>
          <Badge variant="secondary" className="ml-auto">
            {activeMustHave.length}
          </Badge>
        </Button>
        {expandedSections.mustHave && (
          <div className="pt-3">
            <div className="mb-2.5 flex flex-wrap gap-2">
              {constraints.must_have.map((kw) => (
                <KeywordTag
                  key={kw}
                  keyword={kw}
                  type="must_have"
                  isRemoved={isMustHaveRemoved(kw)}
                  onToggle={() => toggleMustHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
              {overrides?.additionalMustHave?.map((kw) => (
                <KeywordTag
                  key={`add-${kw}`}
                  keyword={kw}
                  type="must_have"
                  isAdditional
                  onRemove={() => removeAdditionalMustHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
            </div>
            {onUpdateOverrides && (
              <div className="mt-2.5 flex gap-2">
                <Input
                  placeholder="Add keyword..."
                  value={newMustHave}
                  onChange={(e) => setNewMustHave(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMustHave()}
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={addMustHave}
                  disabled={!newMustHave.trim()}
                  className="h-9 w-9 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            {activeMustHave.length === 0 && !onUpdateOverrides && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No must-have keywords defined.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Mustn't-Have Section */}
      <div className="mb-4">
        <Button
          variant="ghost"
          className="flex w-full items-center justify-start gap-2 rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => toggleSection('mustntHave')}
        >
          {expandedSections.mustntHave ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <X className="h-3 w-3 text-destructive" />
          <span>Mustn't-Have Keywords</span>
          <Badge variant="secondary" className="ml-auto">
            {activeMustntHave.length}
          </Badge>
        </Button>
        {expandedSections.mustntHave && (
          <div className="pt-3">
            <div className="mb-2.5 flex flex-wrap gap-2">
              {constraints.mustnt_have.map((kw) => (
                <KeywordTag
                  key={kw}
                  keyword={kw}
                  type="mustnt_have"
                  isRemoved={isMustntHaveRemoved(kw)}
                  onToggle={() => toggleMustntHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
              {overrides?.additionalMustntHave?.map((kw) => (
                <KeywordTag
                  key={`add-${kw}`}
                  keyword={kw}
                  type="mustnt_have"
                  isAdditional
                  onRemove={() => removeAdditionalMustntHave(kw)}
                  canToggle={!!onUpdateOverrides}
                />
              ))}
            </div>
            {onUpdateOverrides && (
              <div className="mt-2.5 flex gap-2">
                <Input
                  placeholder="Add keyword..."
                  value={newMustntHave}
                  onChange={(e) => setNewMustntHave(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addMustntHave()}
                  className="h-9"
                />
                <Button
                  size="sm"
                  onClick={addMustntHave}
                  disabled={!newMustntHave.trim()}
                  className="h-9 w-9 p-0"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
            {activeMustntHave.length === 0 && !onUpdateOverrides && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                No mustn't-have keywords defined.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Clause item component
interface ClauseItemProps {
  clause: Clause;
  isDisabled: boolean;
  onToggle: () => void;
  canToggle: boolean;
}

function ClauseItem({ clause, isDisabled, onToggle, canToggle }: ClauseItemProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border bg-background p-3 text-sm leading-relaxed',
        isDisabled && 'bg-muted/50 opacity-50'
      )}
    >
      <span className="flex-1 text-muted-foreground">{clause.text}</span>
      {canToggle && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onToggle}
          title={isDisabled ? 'Enable this clause' : 'Disable this clause'}
        >
          {isDisabled ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );
}

// Keyword tag component
interface KeywordTagProps {
  keyword: string;
  type: 'must_have' | 'mustnt_have';
  isRemoved?: boolean;
  isAdditional?: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
  canToggle: boolean;
}

function KeywordTag({
  keyword,
  type,
  isRemoved,
  isAdditional,
  onToggle,
  onRemove,
  canToggle,
}: KeywordTagProps) {
  const isMustHave = type === 'must_have';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm',
        isMustHave ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
        isRemoved && 'line-through opacity-40',
        isAdditional && 'border border-dashed border-current bg-transparent'
      )}
    >
      <span>{keyword}</span>
      {canToggle && !isAdditional && onToggle && (
        <button
          onClick={onToggle}
          title={isRemoved ? 'Restore' : 'Remove'}
          className="inline-flex h-5 w-5 items-center justify-center rounded opacity-70 transition-opacity hover:bg-black/10 hover:opacity-100"
        >
          {isRemoved ? <Plus className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
        </button>
      )}
      {isAdditional && onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          className="inline-flex h-5 w-5 items-center justify-center rounded opacity-70 transition-opacity hover:bg-black/10 hover:opacity-100"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
