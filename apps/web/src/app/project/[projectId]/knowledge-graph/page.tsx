'use client';
import { useParams } from 'next/navigation';
import { KnowledgeGraphPage } from '@/components/knowledge-graph/KnowledgeGraphPage';

export default function KnowledgeGraphRoute() {
  const params = useParams();
  const projectId = params.projectId as string;
  return <KnowledgeGraphPage projectId={projectId} />;
}
