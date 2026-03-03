'use client';

import { use } from 'react';
import { CommitDetailPage } from '@/components/commit/CommitDetailPage';

export default function CommitPage({
  params,
}: {
  params: Promise<{ projectId: string; hash: string }>;
}) {
  const { projectId, hash } = use(params);
  const decodedHash = decodeURIComponent(hash);

  return <CommitDetailPage projectId={projectId} commitHash={decodedHash} />;
}
