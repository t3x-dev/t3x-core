import { headers } from 'next/headers';
import { type ReactNode, Suspense } from 'react';
import { loadSchemaDocument } from '@/server/schemaDocument';
import RepositoryLayoutClient from './RepositoryLayoutClient';

async function RepositoryDocument({
  params,
  children,
}: {
  params: Promise<{ owner: string; repository: string }>;
  children: ReactNode;
}) {
  const { owner, repository } = await params;
  const startup = loadSchemaDocument(await headers(), owner, repository);
  return <RepositoryLayoutClient startup={startup}>{children}</RepositoryLayoutClient>;
}

export default function RepositoryLayout(props: Parameters<typeof RepositoryDocument>[0]) {
  return (
    <Suspense fallback={null}>
      <RepositoryDocument {...props} />
    </Suspense>
  );
}
