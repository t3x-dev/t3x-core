'use client';

import { AlertTriangle, Lightbulb, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface Violation {
  rule_id: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface Suggestion {
  content: string;
  confidence?: number;
}

interface AssertionsSectionProps {
  violations: Violation[];
  suggestion?: Suggestion | string;
  className?: string;
}

export function AssertionsSection({ violations, suggestion, className }: AssertionsSectionProps) {
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const hasSuggestion = suggestion !== undefined && suggestion !== null;

  // Normalize suggestion to string
  const suggestionText = typeof suggestion === 'string' ? suggestion : suggestion?.content;
  const suggestionConfidence = typeof suggestion === 'object' ? suggestion?.confidence : undefined;

  if (violations.length === 0 && !hasSuggestion) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Violations & Suggestions</CardTitle>
          {violations.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--status-error)]">
                  <XCircle className="h-3.5 w-3.5" />
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--status-warning)]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {warningCount} warning{warningCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Violations */}
          {violations.map((v, i) => (
            <div
              key={`violation-${i}`}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3',
                v.severity === 'error'
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-yellow-500/30 bg-yellow-500/5'
              )}
            >
              {v.severity === 'error' ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-error)]" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {v.rule_id}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      v.severity === 'error'
                        ? 'border-red-500/30 text-[var(--status-error)]'
                        : 'border-yellow-500/30 text-[var(--status-warning)]'
                    )}
                  >
                    {v.severity}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{v.message}</p>
              </div>
            </div>
          ))}

          {/* Prompt Improvement Suggestion */}
          {suggestionText && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
              <div className="flex items-start gap-3">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-info)]" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-[var(--status-info)]">Prompt Improvement</span>
                    {suggestionConfidence !== undefined && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(suggestionConfidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{suggestionText}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
