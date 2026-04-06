'use client';

import { AlertTriangle, Loader2, Play, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { BusinessRuleConfig } from '@/lib/api';
import { cn } from '@/lib/utils';

interface BusinessRuleEditorProps {
  rule: BusinessRuleConfig;
  existingIds?: string[];
  onSave: (rule: BusinessRuleConfig) => void;
  onCancel: () => void;
}

export function BusinessRuleEditor({
  rule: initial,
  existingIds = [],
  onSave,
  onCancel,
}: BusinessRuleEditorProps) {
  const [rule, setRule] = useState<BusinessRuleConfig>({ ...initial });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ passed: boolean; message?: string } | null>(null);

  const updateField = useCallback(
    <K extends keyof BusinessRuleConfig>(key: K, value: BusinessRuleConfig[K]) => {
      setRule((prev) => ({ ...prev, [key]: value }));
      setTestResult(null);
    },
    []
  );

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Dynamic import to avoid circular dependency
      const { gateCheck } = await import('@/lib/api/trees');
      // Test with minimal content
      const result = await gateCheck(
        { trees: [], relations: [] },
        {
          business_rules: [rule],
          gates: ['business'],
        }
      );
      const ruleResult = result.business?.results?.find((r) => r.rule_id === rule.id);
      setTestResult(
        ruleResult
          ? { passed: ruleResult.passed, message: ruleResult.message }
          : { passed: false, message: 'Rule not evaluated — check syntax' }
      );
    } catch (err) {
      setTestResult({
        passed: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setTesting(false);
    }
  }, [rule]);

  const isValid =
    rule.id.trim().length > 0 &&
    ((rule.type === 'llm' && (rule.prompt?.trim().length ?? 0) > 0) ||
      (rule.type === 'rule' && (rule.rule?.trim().length ?? 0) > 0));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div
        className="bg-background rounded-lg border shadow-lg w-[520px] max-w-[90vw] max-h-[85vh] overflow-auto"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">
            {initial.prompt || initial.rule ? 'Edit Rule' : 'New Rule'}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Rule ID */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Rule ID</label>
            <input
              type="text"
              value={rule.id}
              onChange={(e) => updateField('id', e.target.value.replace(/\s+/g, '_').toLowerCase())}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="my_rule_name"
            />
            {rule.id !== initial.id && existingIds.includes(rule.id) && (
              <p className="text-[10px] text-amber-600 mt-1">
                A rule with this ID already exists and will be overwritten.
              </p>
            )}
          </div>

          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  rule.type === 'llm'
                    ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-300'
                    : 'hover:bg-muted'
                )}
                onClick={() => updateField('type', 'llm')}
              >
                AI Check (LLM)
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  rule.type === 'rule'
                    ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
                    : 'hover:bg-muted'
                )}
                onClick={() => updateField('type', 'rule')}
              >
                Expression (JS)
              </button>
            </div>
          </div>

          {/* LLM prompt or JS expression */}
          {rule.type === 'llm' ? (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                LLM Prompt
              </label>
              <textarea
                value={rule.prompt ?? ''}
                onChange={(e) => updateField('prompt', e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Check that all decisions have supporting evidence..."
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                The LLM will evaluate the extracted knowledge against this prompt.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                JS Expression
              </label>
              <textarea
                value={rule.rule ?? ''}
                onChange={(e) => updateField('rule', e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="nodes.length >= 3"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Available variables: <code className="font-mono">frames</code>,{' '}
                <code className="font-mono">relations</code>. Must return boolean.
              </p>
            </div>
          )}

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Failure Message
            </label>
            <input
              type="text"
              value={rule.message ?? ''}
              onChange={(e) => updateField('message', e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Shown when this rule fails"
            />
          </div>

          {/* Severity */}
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Severity</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  rule.severity === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
                    : 'hover:bg-muted'
                )}
                onClick={() => updateField('severity', 'warning')}
              >
                <AlertTriangle className="h-3 w-3" />
                Warning
              </button>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                  rule.severity === 'error'
                    ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
                    : 'hover:bg-muted'
                )}
                onClick={() => updateField('severity', 'error')}
              >
                <XCircle className="h-3 w-3" />
                Error
              </button>
            </div>
          </div>

          {/* Test button + result */}
          <div className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleTest}
              disabled={!isValid || testing}
            >
              {testing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Play className="h-3 w-3 mr-1" />
              )}
              Test Rule
            </Button>
            {testResult && (
              <div
                className={cn(
                  'mt-2 rounded-md border p-2 text-xs',
                  testResult.passed
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300'
                )}
              >
                {testResult.passed ? 'Passed' : 'Failed'}
                {testResult.message && ` — ${testResult.message}`}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(rule)} disabled={!isValid}>
            Save Rule
          </Button>
        </div>
      </div>
    </div>
  );
}
