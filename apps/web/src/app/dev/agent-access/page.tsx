import { GitBranch } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { AgentAccessDemo } from '@/components/project/agent-access/AgentAccessDemo';
import { AgentAccessLink } from '@/components/project/agent-access/AgentAccessLink';
import { RepositoryMark } from '@/components/project/RepositoryIdentity';
import inspection from '@/components/project/StateInspection.module.css';
import frame from '@/components/project/StatePageFrame.module.css';
import { demoRepositories } from './chat/demoChat';

export const metadata: Metadata = { title: 'Agent access demo · T3X' };

const previewPath = '/dev/agent-access';
const repository = 'studio/editorial-calendar';

function RepositoryPreview() {
  return (
    <div className={`${frame.palette} ${frame.scroll}`}>
      <div className={`${frame.bounds} py-6 md:py-10`}>
        <header className={`${inspection.surface} border-b border-[var(--stroke-divider)] pb-3`}>
          <p className="text-sm text-[var(--text-secondary)]">Repository preview · Sample data</p>
          <h1 className={inspection.repositoryTitle}>
            <RepositoryMark id={repository} />
            <span>{repository}</span>
          </h1>
          <div className={inspection.sub2}>
            <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <GitBranch aria-hidden="true" size={16} />
              <code>main</code>
            </span>
            <div>
              <AgentAccessLink href={`${previewPath}?view=access`} />
            </div>
          </div>
        </header>
        <section aria-labelledby="calendar-title" className="my-6">
          <h2 className="font-semibold" id="calendar-title">
            Editorial calendar
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Upcoming stories, their owners and their publication status.
          </p>
          <div className="mt-4 overflow-auto rounded-md border border-[var(--stroke-default)] bg-[var(--surface-card)]">
            <table aria-label="Upcoming stories" className="w-full text-left text-sm">
              <thead className="text-[var(--text-secondary)]">
                <tr className="border-b border-[var(--stroke-divider)]">
                  {['Story', 'Owner', 'Status'].map((label) => (
                    <th className="px-4 py-2 font-medium" key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--stroke-divider)]">
                {[
                  ['Year in review', 'Maya', 'Draft'],
                  ['Winter reading list', 'Sam', 'Scheduled'],
                ].map(([title, owner, status]) => (
                  <tr key={title}>
                    <th className="px-4 py-3 font-medium" scope="row">
                      {title}
                    </th>
                    <td className="px-4 py-3">{owner}</td>
                    <td className="px-4 py-3">{status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default async function AgentAccessPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; repository?: string; chat?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { view, repository: target, chat } = await searchParams;
  if (view === 'repository') return <RepositoryPreview />;
  if (view === 'settings') {
    const repo = demoRepositories.find((item) => item.name === target);
    if (!repo) notFound();
    return (
      <>
        <header className="shrink-0 border-b border-[var(--stroke-divider)] bg-[var(--surface-card)] px-5 py-3 text-sm">
          {repo.name} <span aria-hidden="true"> / </span> Repository settings{' '}
          <span aria-hidden="true"> / </span> <strong>Agent access</strong>
        </header>
        <AgentAccessDemo
          repository={repo.name}
          branch={repo.branch}
          scenario={repo.scenario}
          backHref={`${previewPath}/chat?chat=${chat === 'choose' ? 'choose' : 'editorial'}`}
          backLabel="Return to chat"
        />
      </>
    );
  }
  if (view !== 'access') redirect(`${previewPath}/chat`);
  return (
    <AgentAccessDemo
      repository={repository}
      branch="main"
      backHref={`${previewPath}?view=repository`}
    />
  );
}
