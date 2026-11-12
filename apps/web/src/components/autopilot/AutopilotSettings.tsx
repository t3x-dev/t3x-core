'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAutopilotSuggestions } from '@/hooks/shared/useAutopilot';

export function AutopilotSettings({ projectId }: { projectId: string }) {
  const { data, error, isLoading, refetch } = useAutopilotSuggestions(projectId);
  const suggestion = data?.adaptive;
  const feedbackCount = data?.stats?.total;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Automatic commits and Leaf creation are currently unavailable. Previously saved project
        configuration is retained.
      </p>
      <Card className="border-[var(--stroke-divider)]">
        <CardHeader>
          <CardTitle className="text-sm">Extraction threshold suggestions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-[var(--text-secondary)]">
            Read-only suggestions based on extraction feedback from this project.
          </p>
          {isLoading ? (
            <output>Loading suggestions…</output>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2">
              <span>Could not load threshold suggestions.</span>
              <Button type="button" variant="outline" size="sm" onClick={refetch}>
                Retry suggestions
              </Button>
            </div>
          ) : suggestion ? (
            <>
              {typeof feedbackCount === 'number' && feedbackCount > 0 && (
                <p className="text-[var(--text-secondary)]">
                  Based on {feedbackCount} feedback actions
                </p>
              )}
              <dl className="space-y-2">
                <div className="flex flex-wrap gap-x-2">
                  <dt>Similarity threshold adjustment</dt>
                  <dd className="font-mono">
                    {suggestion.cosineThresholdDelta > 0 ? '+' : ''}
                    {suggestion.cosineThresholdDelta.toFixed(3)}
                  </dd>
                </div>
                {suggestion.suppressedTypes.length > 0 && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt>Suggested exclusions</dt>
                    <dd>{suggestion.suppressedTypes.join(', ')}</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className="text-[var(--text-secondary)]">
              More extraction feedback is needed before suggestions are available.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
