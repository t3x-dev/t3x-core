'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, X, Plus, Trash2, Play, CheckCircle } from 'lucide-react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { Button } from '@/components/ui/button';
import { PinButton } from '@/components/ui/PinButton';
import { getLeaf, updateLeaf } from '@/lib/api';
import type { Leaf, Constraint, Assertion } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function LeafDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const leafId = params.leafId as string;

  const [leaf, setLeaf] = useState<Leaf | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);

  // Load leaf data
  useEffect(() => {
    if (!leafId) return;

    const loadLeaf = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getLeaf(leafId);
        setLeaf(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load leaf'));
      } finally {
        setLoading(false);
      }
    };

    loadLeaf();
  }, [leafId]);

  // Handle constraint update
  const handleUpdateConstraints = async (constraints: Constraint[]) => {
    if (!leaf) return;

    try {
      setSaving(true);
      const updated = await updateLeaf(leafId, { constraints });
      setLeaf(updated);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update constraints'));
    } finally {
      setSaving(false);
    }
  };

  // Remove constraint
  const handleRemoveConstraint = (constraintId: string) => {
    if (!leaf) return;
    const updated = leaf.constraints.filter(c => c.id !== constraintId);
    handleUpdateConstraints(updated);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <LoadingSpinner message="Loading leaf data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <ErrorMessage
          error={error}
          onRetry={() => {
            setError(null);
            setLoading(true);
            getLeaf(leafId)
              .then(setLeaf)
              .catch(err => setError(err instanceof Error ? err : new Error(String(err))))
              .finally(() => setLoading(false));
          }}
        />
      </div>
    );
  }

  if (!leaf) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Leaf not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/project/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">
              {leaf.title || `Leaf: ${leaf.id.slice(0, 12)}...`}
            </h1>
            <p className="text-xs text-muted-foreground">
              Type: {leaf.type} | Created: {new Date(leaf.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PinButton projectId={projectId} type="leaf" refId={leafId} />
          {/* Future buttons */}
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <Play className="mr-1 h-3 w-3" />
            Generate
          </Button>
          <Button variant="outline" size="sm" disabled title="Coming soon">
            <CheckCircle className="mr-1 h-3 w-3" />
            Validate
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Constraints Section */}
          <ConstraintsSection
            constraints={leaf.constraints}
            onRemove={handleRemoveConstraint}
            saving={saving}
          />

          {/* Output Section */}
          <OutputSection output={leaf.output} generatedAt={leaf.generated_at} />

          {/* Assertions Section */}
          <AssertionsSection
            assertions={leaf.assertions}
            constraints={leaf.constraints}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Constraints Section
// ============================================================================

interface ConstraintsSectionProps {
  constraints: Constraint[];
  onRemove: (id: string) => void;
  saving: boolean;
}

function ConstraintsSection({ constraints, onRemove, saving }: ConstraintsSectionProps) {
  const requireConstraints = constraints.filter(c => c.type === 'require');
  const excludeConstraints = constraints.filter(c => c.type === 'exclude');

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Constraints</h2>
        <span className="text-sm text-muted-foreground">
          {constraints.length} total
        </span>
      </div>
      <div className="p-4 space-y-4">
        {/* Require constraints */}
        {requireConstraints.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-green-600 mb-2">
              Must Have ({requireConstraints.length})
            </h3>
            <div className="space-y-2">
              {requireConstraints.map(c => (
                <ConstraintItem
                  key={c.id}
                  constraint={c}
                  onRemove={() => onRemove(c.id)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>
        )}

        {/* Exclude constraints */}
        {excludeConstraints.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-red-600 mb-2">
              Must Not Have ({excludeConstraints.length})
            </h3>
            <div className="space-y-2">
              {excludeConstraints.map(c => (
                <ConstraintItem
                  key={c.id}
                  constraint={c}
                  onRemove={() => onRemove(c.id)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>
        )}

        {constraints.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No constraints defined
          </p>
        )}
      </div>
    </section>
  );
}

interface ConstraintItemProps {
  constraint: Constraint;
  onRemove: () => void;
  disabled: boolean;
}

function ConstraintItem({ constraint, onRemove, disabled }: ConstraintItemProps) {
  const isRequire = constraint.type === 'require';

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-2 rounded-md border p-3',
        isRequire ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isRequire ? (
            <Check className="h-4 w-4 text-green-600 shrink-0" />
          ) : (
            <X className="h-4 w-4 text-red-600 shrink-0" />
          )}
          <span className="font-medium text-sm truncate">{constraint.value}</span>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-background rounded">
            {constraint.match_mode}
          </span>
        </div>
        {constraint.description && (
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            {constraint.description}
          </p>
        )}
        {constraint.type === 'exclude' && constraint.reason && (
          <p className="text-xs text-red-600 mt-1 ml-6">
            Reason: {constraint.reason}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onRemove}
        disabled={disabled}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ============================================================================
// Output Section
// ============================================================================

interface OutputSectionProps {
  output: string | null;
  generatedAt: string | null;
}

function OutputSection({ output, generatedAt }: OutputSectionProps) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Output</h2>
        {generatedAt && (
          <span className="text-xs text-muted-foreground">
            Generated: {new Date(generatedAt).toLocaleString()}
          </span>
        )}
      </div>
      <div className="p-4">
        {output ? (
          <div className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">
            {output}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            No output generated yet. Click &quot;Generate&quot; to create output.
          </p>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// Assertions Section
// ============================================================================

interface AssertionsSectionProps {
  assertions: Assertion[] | null;
  constraints: Constraint[];
}

function AssertionsSection({ assertions, constraints }: AssertionsSectionProps) {
  if (!assertions || assertions.length === 0) {
    return (
      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-semibold">Validation Results</h2>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground text-center py-8">
            No validation results yet. Click &quot;Validate&quot; to check constraints.
          </p>
        </div>
      </section>
    );
  }

  const passedCount = assertions.filter(a => a.passed).length;
  const failedCount = assertions.length - passedCount;
  const allPassed = failedCount === 0;

  // Create a map of constraint ID to constraint for quick lookup
  const constraintMap = new Map(constraints.map(c => [c.id, c]));

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Validation Results</h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-1 text-sm font-medium',
              allPassed ? 'text-green-600' : 'text-red-600'
            )}
          >
            {allPassed ? (
              <>
                <Check className="h-4 w-4" />
                All Passed
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                {failedCount} Failed
              </>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            ({passedCount}/{assertions.length})
          </span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {assertions.map(assertion => {
          const constraint = constraintMap.get(assertion.constraint_id);
          return (
            <AssertionItem
              key={assertion.id}
              assertion={assertion}
              constraint={constraint}
            />
          );
        })}
      </div>
    </section>
  );
}

interface AssertionItemProps {
  assertion: Assertion;
  constraint: Constraint | undefined;
}

function AssertionItem({ assertion, constraint }: AssertionItemProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        assertion.passed
          ? 'border-green-200 bg-green-50'
          : 'border-red-200 bg-red-50'
      )}
    >
      <div className="flex items-start gap-2">
        {assertion.passed ? (
          <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        ) : (
          <X className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {constraint?.value || assertion.constraint_id}
            </span>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                assertion.passed ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
              )}
            >
              {assertion.passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{assertion.details}</p>
          {assertion.lesson && (
            <p className="text-xs text-blue-600 mt-1">
              Lesson: {assertion.lesson}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
