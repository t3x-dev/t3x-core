'use client';

import { useParams } from 'next/navigation';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';

export default function OwnerPage() {
  const { owner } = useParams<{ owner: string }>();
  return <ProjectDirectoryPage ownerSlug={owner} />;
}
