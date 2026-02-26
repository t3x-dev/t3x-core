'use client';

/**
 * Diff Page Route
 *
 * Full-screen diff comparison page with three-layer provenance.
 * Query params: ?base={baseHash}&target={targetHash}
 */

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { DiffPage } from '@/components/diff/DiffPage';

function DiffPageContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const projectId = params.projectId as string;
  const baseHash = searchParams.get('base');
  const targetHash = searchParams.get('target');

  if (!baseHash || !targetHash) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">:(</div>
          <h1 className="text-xl font-semibold mb-2">Missing parameters</h1>
          <p className="text-muted-foreground mb-4">
            Both <code>base</code> and <code>target</code> commit hashes are required.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/project/${projectId}`)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Back to canvas
          </button>
        </div>
      </div>
    );
  }

  return <DiffPage projectId={projectId} baseHash={baseHash} targetHash={targetHash} />;
}

export default function DiffRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <DiffPageContent />
    </Suspense>
  );
}
