'use client';

import { AlertTriangle, Edit, Loader2, Plus, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type BusinessRuleConfig, getBusinessRules, putBusinessRules } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BusinessRuleEditor } from './BusinessRuleEditor';
import { BusinessRuleTemplates } from './BusinessRuleTemplates';

interface BusinessRulesSectionProps {
  projectId: string;
}

export function BusinessRulesSection({ projectId }: BusinessRulesSectionProps) {
  const [rules, setRules] = useState<BusinessRuleConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<BusinessRuleConfig | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load rules on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBusinessRules(projectId)
      .then((r) => {
        if (!cancelled) setRules(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load rules');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Debounced save
  const saveRules = useCallback(
    (updated: BusinessRuleConfig[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await putBusinessRules(projectId, updated);
        } catch {
          setError('Failed to save rules');
        } finally {
          setSaving(false);
        }
      }, 500);
    },
    [projectId]
  );

  const handleDelete = useCallback(
    (ruleId: string) => {
      const updated = rules.filter((r) => r.id !== ruleId);
      setRules(updated);
      saveRules(updated);
    },
    [rules, saveRules]
  );

  const handleAddRule = useCallback(() => {
    const newRule: BusinessRuleConfig = {
      id: `rule_${crypto.randomUUID().slice(0, 8)}`,
      type: 'llm',
      prompt: '',
      message: 'Rule violation detected',
      severity: 'warning',
    };
    setEditingRule(newRule);
  }, []);

  const handleEditRule = useCallback((rule: BusinessRuleConfig) => {
    setEditingRule(rule);
  }, []);

  const handleSaveRule = useCallback(
    (rule: BusinessRuleConfig) => {
      const exists = rules.some((r) => r.id === rule.id);
      const updated = exists ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule];
      setRules(updated);
      saveRules(updated);
      setEditingRule(null);
    },
    [rules, saveRules]
  );

  const handleAddFromTemplate = useCallback(
    (rule: BusinessRuleConfig) => {
      const updated = [...rules, rule];
      setRules(updated);
      saveRules(updated);
    },
    [rules, saveRules]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading business rules...
      </div>
    );
  }

  return (
    <div id="business-rules">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Business Rules</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Define quality rules that are automatically checked during gate checks.
            {saving && <span className="ml-2 text-amber-500">Saving...</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowTemplates(true)}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            From Template
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddRule}>
            <Plus className="h-3 w-3 mr-1" />
            Add Rule
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300 mb-4">
          {error}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium">No business rules configured</p>
          <p className="text-xs mt-1">
            Add rules to automatically validate knowledge quality during gate checks.
          </p>
          <div className="flex gap-2 justify-center mt-4">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowTemplates(true)}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              Browse Templates
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAddRule}>
              <Plus className="h-3 w-3 mr-1" />
              Create Rule
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-3 rounded-md border px-3 py-2.5">
              {rule.severity === 'error' ? (
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{rule.id}</span>
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-medium',
                      rule.type === 'llm'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    )}
                  >
                    {rule.type === 'llm' ? 'AI' : 'expr'}
                  </span>
                </div>
                <p className="text-sm mt-0.5 truncate">
                  {rule.type === 'llm' ? rule.prompt : rule.rule}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleEditRule(rule)}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(rule.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingRule && (
        <BusinessRuleEditor
          rule={editingRule}
          existingIds={rules.map((r) => r.id)}
          onSave={handleSaveRule}
          onCancel={() => setEditingRule(null)}
        />
      )}

      {showTemplates && (
        <BusinessRuleTemplates
          onAdd={(rule) => {
            handleAddFromTemplate(rule);
          }}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}
