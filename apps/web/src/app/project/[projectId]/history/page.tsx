'use client';

import { use } from 'react';
import { CommitHistoryPage } from '@/components/history/CommitHistoryPage';

export default function HistoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);

  return <CommitHistoryPage projectId={projectId} />;
}
