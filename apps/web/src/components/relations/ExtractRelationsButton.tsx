'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { extractCommitRelations } from '@/lib/api/relations';

interface ExtractRelationsButtonProps {
  commitHash: string;
  onExtracted: () => void;
}

export function ExtractRelationsButton({ commitHash, onExtracted }: ExtractRelationsButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await extractCommitRelations(commitHash);
      setResult(
        `Found ${data.relations_found} relations (${data.stats.total_sentences} sentences, ${data.stats.avg_confidence.toFixed(2)} avg confidence, ${data.stats.extraction_time_ms}ms)`
      );
      onExtracted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  }, [commitHash, onExtracted]);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleExtract}
        disabled={loading || !commitHash}
        className="gap-1.5"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? 'Extracting...' : 'Extract Relations'}
      </Button>

      {result && (
        <div className="px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md">
          {result}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
