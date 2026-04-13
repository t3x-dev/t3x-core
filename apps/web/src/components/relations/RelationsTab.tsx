'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCommitRelations } from '@/infrastructure/relations';
import { cn } from '@/lib/utils';
import type { NodeRelation, RelationType } from '@/types/api';
import { RelationsGraph } from './RelationsGraph';
import { RelationsList } from './RelationsList';

interface RelationsTabProps {
  commitHash: string;
  nodes: Array<{ id: string; text: string }>;
}

const ALL_TYPES: RelationType[] = ['causes', 'conditions', 'contrasts', 'follows', 'depends'];

export function RelationsTab({ commitHash, nodes }: RelationsTabProps) {
  const [relations, setRelations] = useState<NodeRelation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typeFilters, setTypeFilters] = useState<Set<RelationType>>(() => new Set(ALL_TYPES));
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
    () => relations.filter((r) => typeFilters.has(r.type)),
    [relations, typeFilters]
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-tertiary)]">
          {relations.length} relation{relations.length !== 1 ? 's' : ''} found
          {filtered.length !== relations.length && ` (${filtered.length} shown)`}
        </span>
      </div>

      {/* Filters */}
      {relations.length > 0 && (
        <div className="flex flex-col gap-3 p-3 bg-[var(--surface-app)] border border-[var(--stroke-divider)] rounded-md">
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
          <RelationsList relations={filtered} nodes={nodes} />
        </TabsContent>

        <TabsContent value="graph">
          <RelationsGraph relations={filtered} nodes={nodes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
