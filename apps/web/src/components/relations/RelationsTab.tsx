'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCommitRelations, type RelationType, type SentenceRelation } from '@/lib/api/relations';
import { cn } from '@/lib/utils';
import { ExtractRelationsButton } from './ExtractRelationsButton';
import { RelationsGraph } from './RelationsGraph';
import { RelationsList } from './RelationsList';

interface RelationsTabProps {
  commitHash: string;
  sentences: Array<{ id: string; text: string }>;
}

const ALL_TYPES: RelationType[] = [
  'supports',
  'contrasts',
  'causes',
  'elaborates',
  'temporal_follows',
  'conditions',
  'summarizes',
];

export function RelationsTab({ commitHash, sentences }: RelationsTabProps) {
  const [relations, setRelations] = useState<SentenceRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilters, setTypeFilters] = useState<Set<RelationType>>(() => new Set(ALL_TYPES));
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);

  const fetchRelations = useCallback(async () => {
    if (!commitHash) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getCommitRelations(commitHash);
      setRelations(data.relations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load relations');
    } finally {
      setLoading(false);
    }
  }, [commitHash]);

  useEffect(() => {
    fetchRelations();
  }, [fetchRelations]);

  // Filtered relations
  const filtered = useMemo(
    () => relations.filter((r) => typeFilters.has(r.type) && r.confidence >= confidenceThreshold),
    [relations, typeFilters, confidenceThreshold]
  );

  const toggleType = useCallback((type: RelationType) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-[var(--text-tertiary)] text-sm">
        Loading relations...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10">
        <p className="text-sm text-[var(--text-tertiary)]">{error}</p>
        <ExtractRelationsButton commitHash={commitHash} onExtracted={fetchRelations} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Header: extract button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">
          {relations.length} relation{relations.length !== 1 ? 's' : ''} found
          {filtered.length !== relations.length && ` (${filtered.length} shown)`}
        </span>
        <ExtractRelationsButton commitHash={commitHash} onExtracted={fetchRelations} />
      </div>

      {/* Filters */}
      {relations.length > 0 && (
        <div className="flex flex-col gap-3 p-3 bg-[var(--surface-app)] border border-[var(--stroke-divider)] rounded-md">
          {/* Type filter checkboxes */}
          <div className="flex flex-wrap gap-2">
            {ALL_TYPES.map((type) => (
              <label
                key={type}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer select-none transition-opacity',
                  typeFilters.has(type) ? 'opacity-100' : 'opacity-40'
                )}
              >
                <input
                  type="checkbox"
                  checked={typeFilters.has(type)}
                  onChange={() => toggleType(type)}
                  className="accent-blue-500 w-3 h-3"
                />
                <span className="text-[var(--text-secondary)]">{type.replace('_', ' ')}</span>
              </label>
            ))}
          </div>

          {/* Confidence threshold slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-tertiary)] shrink-0">Min confidence</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number.parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-blue-500"
            />
            <span className="text-xs text-[var(--text-secondary)] font-mono w-8 text-right">
              {confidenceThreshold.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* List / Graph toggle */}
      <Tabs defaultValue="list">
        <TabsList className="w-full justify-start rounded-none border-b border-[var(--stroke-divider)] bg-transparent px-0 h-auto">
          <TabsTrigger
            value="list"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
          >
            List
          </TabsTrigger>
          <TabsTrigger
            value="graph"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[var(--accent-commit)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none text-[var(--text-tertiary)] text-xs px-3 py-2"
          >
            Graph
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <RelationsList relations={filtered} sentences={sentences} />
        </TabsContent>

        <TabsContent value="graph">
          <RelationsGraph relations={filtered} sentences={sentences} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
