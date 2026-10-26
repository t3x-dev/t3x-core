'use client';

import { notFound, useParams } from 'next/navigation';
import { ProjectChecksPage } from '@/components/checks/ProjectChecksPage';

export default function ChecksPage() {
  const { projectId, record } = useParams<{ projectId: string; record?: string[] }>();
  if (record && record.length > 1) notFound();
  return <ProjectChecksPage projectId={projectId} recordId={record?.[0]} />;
}
