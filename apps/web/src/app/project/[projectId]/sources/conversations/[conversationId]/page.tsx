'use client';

import { use } from 'react';
import { ConversationSourceEvidencePage } from '@/components/sources/ConversationSourceEvidencePage';

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default function RepositoryConversationSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, conversationId } = use(params);
  const query = use(searchParams);

  return (
    <ConversationSourceEvidencePage
      projectId={decodeURIComponent(projectId)}
      conversationId={decodeURIComponent(conversationId)}
      branch={first(query.branch)}
      commitId={first(query.commit)}
      turnHash={first(query.turn)}
      returnTo={first(query.returnTo)}
    />
  );
}
