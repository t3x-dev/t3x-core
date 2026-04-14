'use client';

import { ArrowLeft, Hammer, Loader2, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { glass } from '@/utils/theme';
import { cn } from '@/utils/cn';
import { useKnowledgeGraph } from '@/hooks/useKnowledgeGraph';

interface KGToolbarProps {
  projectId: string;
}

export function KGToolbar({ projectId }: KGToolbarProps) {
  const { buildGraph, searchNodes, fetchNodes, deleteGraph, building } = useKnowledgeGraph();
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (value.trim()) {
          searchNodes(projectId, value.trim());
        } else {
          fetchNodes(projectId);
        }
      }, 300);
    },
    [projectId, searchNodes, fetchNodes]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleDelete = useCallback(() => {
    if (
      window.confirm('Delete the entire knowledge graph for this project? This cannot be undone.')
    ) {
      deleteGraph(projectId);
    }
  }, [projectId, deleteGraph]);

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-[var(--stroke-divider)] px-5',
        glass.panelBase,
        glass.highlight
      )}
    >
      <div className="flex items-center gap-3">
        <Link
          href={`/project/${projectId}`}
          title="Back to Canvas"
          className={cn(
            'inline-flex items-center justify-center h-9 w-9 rounded-xl transition-all',
            'text-[var(--text-secondary)] hover:text-foreground',
            'hover:bg-primary/10 hover:text-primary'
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Knowledge Graph</h2>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search nodes..."
            className="h-8 w-48 pl-8 text-xs rounded-lg"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => buildGraph(projectId)}
          disabled={building}
          title="Build Graph"
          className={cn(
            'h-9 px-3 rounded-xl transition-all text-xs gap-1.5',
            'text-[var(--text-secondary)] hover:text-foreground',
            'hover:bg-primary/10 hover:text-primary'
          )}
        >
          {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />}
          Build
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          title="Delete Graph"
          className={cn(
            'h-9 w-9 rounded-xl transition-all',
            'text-[var(--text-secondary)] hover:text-foreground',
            'hover:bg-destructive/10 hover:text-destructive'
          )}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
