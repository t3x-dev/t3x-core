'use client';

import {
  ArrowLeft,
  Check,
  CheckCircle,
  Copy,
  Download,
  FileJson,
  FileText,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorMessage, LoadingSpinner } from '@/components/ApiStatus';
import { LeafConstraintSourceContext } from '@/components/leaf/LeafConstraintSourceContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PinButton } from '@/components/ui/PinButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Assertion, CommitV4, Constraint, Leaf } from '@/lib/api';
import {
  ApiError,
  generateLeafOutput,
  getCommitV4,
  getLeaf,
  updateLeaf,
  validateLeafOutput,
} from '@/lib/api';
import { type ExportFormat, exportLeaf } from '@/lib/export';
import { cn } from '@/lib/utils';
import type { SentenceWithSource } from '@/types/sourceContext';

function getGenerateErrorMessage(error: string): {
  title: string;
  description: string;
  showRetry: boolean;
} {
  if (error.includes('GENERATION_NOT_CONFIGURED') || error.includes('API_KEY')) {
    return {
      title: 'LLM API Key Not Configured',
      description: 'Set ANTHROPIC_API_KEY in your environment to enable AI generation.',
      showRetry: false,
    };
  }
  if (error.includes('GENERATION_FAILED') || error.includes('timeout')) {
    return {
      title: 'Generation Failed',
      description: 'The AI service encountered an error. Please try again.',
      showRetry: true,
    };
  }
  return { title: 'Error', description: error, showRetry: true };
}

export default function LeafDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const leafId = params.leafId as string;

  const [leaf, setLeaf] = useState<Leaf | null>(null);
  const leafRef = useRef<Leaf | null>(null);
  const constraintAbortRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatePhase, setGeneratePhase] = useState(0);
  const generateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [semanticWarning, setSemanticWarning] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [commitData, setCommitData] = useState<CommitV4 | null>(null);
  const [commitLoadError, setCommitLoadError] = useState(false);

  // Keep leafRef in sync with leaf state
  useEffect(() => {
    leafRef.current = leaf;
  }, [leaf]);

  // Cleanup AbortController on unmount
  useEffect(() => {
    return () => {
      constraintAbortRef.current?.abort();
    };
  }, []);

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

  // Generate progress phase messages
  const generateProgressMessages = useMemo(
    () => [
      'Preparing context...',
      'Generating output...',
      'Validating constraints...',
      'Finalizing...',
    ],
    []
  );

  // Cycle through generate phases
  useEffect(() => {
    if (!isGenerating) {
      setGeneratePhase(0);
      if (generateTimerRef.current) clearInterval(generateTimerRef.current);
      return;
    }
    generateTimerRef.current = setInterval(() => {
      setGeneratePhase((p) => Math.min(p + 1, generateProgressMessages.length - 1));
    }, 8000);
    return () => {
      if (generateTimerRef.current) clearInterval(generateTimerRef.current);
    };
  }, [isGenerating, generateProgressMessages]);

  // Load parent commit data for source content display
  useEffect(() => {
    if (!leaf?.commit_hash) return;
    getCommitV4(leaf.commit_hash)
      .then(setCommitData)
      .catch(() => {
        setCommitLoadError(true);
      });
  }, [leaf?.commit_hash]);

  // Memoize sentences to prevent unnecessary re-renders in LeafConstraintSourceContext
  // This is critical: without memoization, .map() creates a new array on every render,
  // which triggers useEffect/useMemo in child component causing UI jumping
  const sentences = useMemo((): SentenceWithSource[] => {
    if (!commitData) return [];
    return commitData.content.sentences.map((s) => ({
      id: s.id,
      text: s.text,
      source: s.source_ref
        ? {
            turn_hash: s.source_ref.turn_hash,
            start_char: s.source_ref.start_char,
            end_char: s.source_ref.end_char,
          }
        : undefined,
    }));
  }, [commitData]);

  // Handle constraint update (with optimistic update and abort support)
  const handleUpdateConstraints = useCallback(
    async (constraints: Constraint[], optimisticLeaf?: Leaf) => {
      // Abort any in-flight constraint update
      constraintAbortRef.current?.abort();
      const controller = new AbortController();
      constraintAbortRef.current = controller;

      // Apply optimistic update immediately if provided
      if (optimisticLeaf) {
        setLeaf(optimisticLeaf);
      }

      try {
        setSaving(true);
        const updated = await updateLeaf(leafId, { constraints });
        // Sync with server state unless this request was superseded
        if (!controller.signal.aborted) {
          setLeaf(updated);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          // Revert to latest known good state on error
          if (optimisticLeaf && leafRef.current) {
            setLeaf(leafRef.current);
          }
          setError(err instanceof Error ? err : new Error('Failed to update constraints'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setSaving(false);
        }
      }
    },
    [leafId]
  );

  // Remove constraint with optimistic update
  const handleRemoveConstraint = useCallback(
    (constraintId: string) => {
      const current = leafRef.current;
      if (!current || saving) return;
      const updatedConstraints = current.constraints.filter((c) => c.id !== constraintId);
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints]
  );

  // Add new constraint with optimistic update
  const handleAddConstraint = useCallback(
    (type: 'require' | 'exclude', value: string, matchMode: 'exact' | 'semantic' = 'exact') => {
      const current = leafRef.current;
      if (!current || saving || !value.trim()) return;
      const newConstraint: Constraint = {
        id: `cst_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        type,
        value: value.trim(),
        match_mode: matchMode,
      };
      const updatedConstraints = [...current.constraints, newConstraint];
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints]
  );

  // Add constraint with source sentence tracing (with optimistic update)
  const handleAddConstraintFromSource = useCallback(
    (type: 'require' | 'exclude', value: string, sourceSentenceId: string) => {
      const current = leafRef.current;
      if (!current || saving || !value.trim()) return;
      const base = {
        id: `cst_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10)}`,
        value: value.trim(),
        match_mode: 'exact' as const,
        description: `Selected from sentence ${sourceSentenceId}`,
      };
      const newConstraint: Constraint =
        type === 'require'
          ? { ...base, type: 'require', source_sentence_id: sourceSentenceId }
          : { ...base, type: 'exclude', reason: `Excluded from sentence ${sourceSentenceId}` };
      const updatedConstraints = [...current.constraints, newConstraint];
      const optimisticLeaf = { ...current, constraints: updatedConstraints };
      handleUpdateConstraints(updatedConstraints, optimisticLeaf);
    },
    [saving, handleUpdateConstraints]
  );

  // Handle generate output (with auto-validation)
  const handleGenerate = async () => {
    if (!leaf) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const _result = await generateLeafOutput(leafId);
      // Update local leaf data with generated output + auto-validation assertions
      // The API now auto-validates and stores assertions, so re-fetch leaf to get full state
      const updatedLeaf = await getLeaf(leafId);
      setLeaf(updatedLeaf);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Generation failed';
      setGenerateError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle validate output
  const handleValidate = async () => {
    if (!leaf || !leaf.output) return;

    setIsValidating(true);
    setValidateError(null);
    setSemanticWarning(false);

    try {
      const result = await validateLeafOutput(leafId);
      // Update local leaf data with validation results
      setLeaf(result.leaf);

      // Check if any constraints use semantic matching and show warning
      const hasSemanticConstraints = leaf.constraints.some((c) => c.match_mode === 'semantic');
      if (hasSemanticConstraints) {
        setSemanticWarning(true);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Validation failed';
      setValidateError(message);
    } finally {
      setIsValidating(false);
    }
  };

  // Handle export
  const handleExport = async (format: ExportFormat) => {
    if (!leaf) return;

    const result = await exportLeaf(leaf, format);
    setExportMessage({
      type: result.success ? 'success' : 'error',
      text: result.message,
    });

    // Auto-clear success message after 3 seconds
    if (result.success) {
      setTimeout(() => setExportMessage(null), 3000);
    }
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
              .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
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
          <Button variant="ghost" size="icon" onClick={() => router.push(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold">
              {leaf.title || `Leaf: ${leaf.id.slice(0, 12)}...`}
            </h1>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {leaf.type}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(leaf.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PinButton projectId={projectId} type="leaf" refId={leafId} />
          {/* Generate button */}
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
            <span className="mr-1 inline-flex h-3 w-3">
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
            </span>
            {isGenerating ? generateProgressMessages[generatePhase] : 'Generate & Verify'}
          </Button>
          {/* Re-validate button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={isValidating || !leaf.output}
            title={!leaf.output ? 'Generate output first' : undefined}
          >
            <span className="mr-1 inline-flex h-3 w-3">
              {isValidating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle className="h-3 w-3" />
              )}
            </span>
            {isValidating ? 'Validating...' : 'Re-validate'}
          </Button>
          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-3 w-3" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('clipboard')} disabled={!leaf.output}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Output
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('markdown')}>
                <FileText className="mr-2 h-4 w-4" />
                Export as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')}>
                <FileJson className="mr-2 h-4 w-4" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Generate error message */}
      {generateError &&
        (() => {
          const info = getGenerateErrorMessage(generateError);
          return (
            <div className="mx-4 mt-2 rounded-md border bg-card px-4 py-3">
              <p className="text-sm font-medium text-destructive">{info.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{info.description}</p>
              {info.showRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  Retry
                </Button>
              )}
            </div>
          );
        })()}

      {/* Validate error message */}
      {validateError && (
        <div className="mx-4 mt-2 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {validateError}
        </div>
      )}

      {/* Semantic validation warning */}
      {semanticWarning && (
        <div className="mx-4 mt-2 rounded-md bg-yellow-100 dark:bg-yellow-900/30 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          Note: Semantic validation is not yet supported. Only exact match was used for validation.
        </div>
      )}

      {/* Export message */}
      {exportMessage && (
        <div
          className={cn(
            'mx-4 mt-2 rounded-md px-4 py-2 text-sm',
            exportMessage.type === 'success'
              ? 'bg-green-100 text-green-800'
              : 'bg-destructive/10 text-destructive'
          )}
        >
          {exportMessage.text}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Commit load warning */}
          {commitLoadError && (
            <div className="rounded-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
              Source commit data unavailable — constraints shown without source context.
            </div>
          )}

          {/* Source Context with constraint highlights + text selection */}
          {commitData && sentences.length > 0 && (
            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4" />
                Source Content &amp; Constraints
              </h3>
              <LeafConstraintSourceContext
                sentences={sentences}
                constraints={leaf.constraints}
                onAdd={handleAddConstraintFromSource}
                onRemove={handleRemoveConstraint}
                saving={saving}
              />
            </section>
          )}

          {/* Fallback: manual constraints when commit data unavailable */}
          {!commitData && (
            <ConstraintsSection
              constraints={leaf.constraints}
              onRemove={handleRemoveConstraint}
              onAdd={handleAddConstraint}
              saving={saving}
            />
          )}

          {/* Output Section */}
          <OutputSection output={leaf.output} generatedAt={leaf.generated_at} />

          {/* Assertions Section */}
          <AssertionsSection assertions={leaf.assertions} constraints={leaf.constraints} />
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
  onAdd: (type: 'require' | 'exclude', value: string, matchMode?: 'exact' | 'semantic') => void;
  saving: boolean;
}

function ConstraintsSection({ constraints, onRemove, onAdd, saving }: ConstraintsSectionProps) {
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
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="font-semibold">Constraints</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{constraints.length} total</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={saving}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {/* Add constraint form */}
        {showAddForm && (
          <div className="rounded-md border border-dashed p-3 space-y-3">
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
                value={newConstraintType}
                onChange={(e) => setNewConstraintType(e.target.value as 'require' | 'exclude')}
              >
                <option value="require">Must Have</option>
                <option value="exclude">Must Not Have</option>
              </select>
              <input
                type="text"
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                placeholder="Enter constraint value..."
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
            <p className="text-xs text-muted-foreground">
              Add keywords or phrases that must (or must not) appear in the generated output.
            </p>
          </div>
        )}

        {/* Require constraints */}
        {requireConstraints.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-green-600 mb-2">
              Must Have ({requireConstraints.length})
            </h3>
            <div className="space-y-2">
              {requireConstraints.map((c) => (
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
              {excludeConstraints.map((c) => (
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

        {constraints.length === 0 && !showAddForm && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No constraints defined. Click &quot;Add&quot; to create constraints.
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-medium text-sm truncate">{constraint.value}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs break-words">
              {constraint.value}
            </TooltipContent>
          </Tooltip>
          <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-background rounded">
            {constraint.match_mode}
          </span>
        </div>
        {constraint.description && (
          <p className="text-xs text-muted-foreground mt-1 ml-6">{constraint.description}</p>
        )}
        {constraint.type === 'exclude' && constraint.reason && (
          <p className="text-xs text-red-600 mt-1 ml-6">Reason: {constraint.reason}</p>
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
          <div className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">{output}</div>
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

  const passedCount = assertions.filter((a) => a.passed).length;
  const failedCount = assertions.length - passedCount;
  const allPassed = failedCount === 0;

  // Create a map of constraint ID to constraint for quick lookup
  const constraintMap = new Map(constraints.map((c) => [c.id, c]));

  return (
    <section
      className={cn(
        'rounded-lg border bg-card transition-all duration-500',
        allPassed && 'ring-2 ring-green-400/50 animate-in fade-in zoom-in-95 duration-500'
      )}
    >
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
                <CheckCircle className="h-4 w-4" />
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
        {assertions.map((assertion) => {
          const constraint = constraintMap.get(assertion.constraint_id);
          return <AssertionItem key={assertion.id} assertion={assertion} constraint={constraint} />;
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
        assertion.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
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
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-medium text-sm truncate max-w-[200px]">
                  {constraint?.value || assertion.constraint_id}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs break-words">
                {constraint?.value || assertion.constraint_id}
              </TooltipContent>
            </Tooltip>
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                assertion.passed
                  ? 'bg-green-200 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-red-200 dark:bg-red-900/30 text-red-800 dark:text-red-300'
              )}
            >
              {assertion.passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{assertion.details}</p>
          {assertion.lesson && (
            <p className="text-xs text-blue-600 mt-1">Lesson: {assertion.lesson}</p>
          )}
        </div>
      </div>
    </div>
  );
}
