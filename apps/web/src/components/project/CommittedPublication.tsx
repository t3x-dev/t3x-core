'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { commitStructureHref } from '@/domain/project/objectLocation';
import { readPublicationConfig } from '@/domain/project/publication';
import { useCommittedPublication } from '@/hooks/commits/useCommittedPublication';
import type { ApiCommit } from '@/types/api';
import { PublicationView } from './PublicationView';

export function CommittedPublication({
  commit,
  projectName,
  repositoryPath,
}: {
  commit: ApiCommit;
  projectName: string;
  repositoryPath?: string;
}) {
  const search = useSearchParams();
  const { result, retry } = useCommittedPublication(commit.project_id, commit.hash);
  if (!result) return <output className="p-6 text-sm">Loading complete State…</output>;
  if (result.error)
    return (
      <div className="p-6">
        <p role="alert">{result.error}</p>
        <Button variant="outline" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  const { config, error } = readPublicationConfig(search);
  return (
    <PublicationView
      key={`${commit.project_id}:${commit.hash}:${JSON.stringify(config)}`}
      source={{
        project: projectName,
        projectId: commit.project_id,
        stage: 'Committed State',
        version: commit.hash,
        branch: commit.branch,
        subject: 'Content',
        value: result.value,
      }}
      commitHref={commitStructureHref(repositoryPath, commit)}
      initialConfig={config}
      configError={error}
    />
  );
}
