import type { Metadata } from 'next';
import { ProjectDirectoryPage } from '@/components/project/ProjectDirectoryPage';

export const metadata: Metadata = { title: 'Your repositories · T3X' };

export default function RepositoriesPage() {
  return <ProjectDirectoryPage scope="accessible" />;
}
