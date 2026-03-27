'use client';

import { Loader2, Zap } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { autoCommitDraft } from '@/lib/api/autopilot';

export function AutoCommitButton({ draftId }: { draftId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleClick = async () => {
    try {
      setLoading(true);
      setMessage(null);
      setIsError(false);
      const result = await autoCommitDraft(draftId);
      if (result.auto_committed) {
        setMessage(`Auto-committed: ${result.sentences_committed ?? 0} sentences`);
      } else {
        setMessage(result.reason ?? 'Auto-commit skipped');
      }
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : 'Auto-commit failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={loading} onClick={handleClick}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
        ) : (
          <Zap className="h-4 w-4 mr-1.5" />
        )}
        Auto-Commit
      </Button>
      {message && (
        <span className={`text-xs ${isError ? 'text-[var(--status-error)]' : 'text-[var(--text-secondary)]'}`}>
          {message}
        </span>
      )}
    </div>
  );
}
