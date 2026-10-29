'use client';

import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import Changes from '@/app/project/[projectId]/changes/[workspaceId]/[snapshotId]/page';
import { ProjectChecksPage } from '@/components/checks/ProjectChecksPage';
import { RepositoryRouteContext } from '@/hooks/projects/repositoryRouteContext';
import { ProjectRouteShell } from './ProjectRouteShell';

const Settings = dynamic(() => import('@/app/project/[projectId]/settings/page'), {
  loading: () => (
    <output className="flex items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-5 animate-spin" />
      Loading repository settings...
    </output>
  ),
});
const Diff = dynamic(() => import('@/app/project/[projectId]/diff/page'));
const Merge = dynamic(() => import('@/app/project/[projectId]/merge/[mergeId]/page'));
const History = dynamic(() =>
  import('@/components/history/CommitHistoryPage').then((m) => m.CommitHistoryPage)
);
const Knowledge = dynamic(() =>
  import('@/components/knowledge-graph/KnowledgeGraphPage').then((m) => m.KnowledgeGraphPage)
);
const Source = dynamic(() =>
  import('@/components/sources/ConversationSourceEvidencePage').then(
    (m) => m.ConversationSourceEvidencePage
  )
);

export function RepositoryNestedPage({
  projectId,
  segments,
}: {
  projectId: string;
  segments: string[];
}) {
  const query = useSearchParams();
  const [view, first = '', second = ''] = segments;
  const params = {
    projectId,
    mergeId: first,
    workspaceId: first,
    snapshotId: second,
  };
  let content;
  switch (view) {
    case 'checks':
      content = <ProjectChecksPage projectId={projectId} recordId={first || undefined} />;
      break;
    case 'settings':
      content = <Settings />;
      break;
    case 'diff':
      content = <Diff />;
      break;
    case 'merge':
      content = <Merge />;
      break;
    case 'changes':
      content = <Changes />;
      break;
    case 'history':
      content = <History projectId={projectId} />;
      break;
    case 'knowledge-graph':
      content = <Knowledge projectId={projectId} />;
      break;
    case 'sources':
      content = (
        <Source
          projectId={projectId}
          conversationId={second}
          branch={query.get('branch')}
          commitId={query.get('commit')}
          turnHash={query.get('turn')}
          returnTo={query.get('returnTo')}
        />
      );
      break;
    default:
      return null;
  }
  return (
    <RepositoryRouteContext.Provider value={params}>
      <ProjectRouteShell projectId={projectId}>{content}</ProjectRouteShell>
    </RepositoryRouteContext.Provider>
  );
}
