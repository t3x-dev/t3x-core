'use client';

/**
 * Share Page — Read-only viewer for shared entities.
 *
 * Resolves a share token and displays the entity (Leaf or Commit)
 * in a minimal read-only layout without the App Shell (no sidebar).
 */

import { AlertCircle, FileText, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import * as api from '@/lib/api';
import { glass } from '@/lib/theme';
import { cn } from '@/lib/utils';

interface LeafData {
  id: string;
  title?: string;
  type: string;
  output?: string;
  constraints?: Array<{
    id: string;
    type: string;
    value: string;
  }>;
  assertions?: Array<{
    id: string;
    constraint_id: string;
    passed: boolean;
    details: string;
  }>;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<string | null>(null);
  const [entity, setEntity] = useState<unknown>(null);

  useEffect(() => {
    if (!token) return;

    api
      .resolveShareLink(token)
      .then((result) => {
        setEntityType(result.token_info.entity_type);
        setEntity(result.entity);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Share link not found or expired');
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Link Not Found</h1>
          <p className="text-[var(--text-secondary)] max-w-md">{error}</p>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Go to T3X
          </Button>
        </div>
      </div>
    );
  }

  if (entityType === 'leaf') {
    return <SharedLeafView leaf={entity as LeafData} />;
  }

  // Fallback for unsupported entity types
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--surface-app)]">
      <p className="text-[var(--text-secondary)]">Unsupported entity type: {entityType}</p>
    </div>
  );
}

function SharedLeafView({ leaf }: { leaf: LeafData }) {
  return (
    <div className="min-h-screen bg-[var(--surface-app)]">
      {/* Header */}
      <header className={cn('flex h-14 items-center gap-4 px-6 border-b', glass.panelBase)}>
        <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {leaf.title || 'Shared Leaf'}
        </h1>
        <span className="rounded-md bg-[var(--hover-bg)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
          {leaf.type}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-[var(--text-tertiary)]">Shared via T3X</span>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        {/* Output */}
        {leaf.output && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">Output</h2>
            <div className={cn('rounded-xl p-4', glass.cardBase, glass.highlight)}>
              <p className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                {leaf.output}
              </p>
            </div>
          </section>
        )}

        {/* Constraints */}
        {leaf.constraints && leaf.constraints.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Constraints ({leaf.constraints.length})
            </h2>
            <div className="space-y-2">
              {leaf.constraints.map((c) => (
                <div key={c.id} className={cn('rounded-lg px-3 py-2 text-sm', glass.cardBase)}>
                  <span className="font-medium text-[var(--text-primary)]">{c.type}: </span>
                  <span className="text-[var(--text-secondary)]">{c.value}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Assertions */}
        {leaf.assertions && leaf.assertions.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-2">
              Assertions ({leaf.assertions.filter((a) => a.passed).length}/{leaf.assertions.length}{' '}
              passed)
            </h2>
            <div className="space-y-2">
              {leaf.assertions.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm flex items-center gap-2',
                    glass.cardBase
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      a.passed ? 'bg-[var(--diff-added-accent)]' : 'bg-destructive'
                    )}
                  />
                  <span className="text-[var(--text-primary)]">{a.details}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
