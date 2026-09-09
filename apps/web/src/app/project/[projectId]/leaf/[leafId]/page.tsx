'use client';
import { useParams } from 'next/navigation';
import { LegacyLeafReader } from '@/components/leaf/LegacyLeafReader';
export default function LeafDetailPage() {
  return <LeafDetailWorkspace />;
}
export function LeafDetailWorkspace({
  leafIdOverride,
  projectIdOverride,
}: {
  leafIdOverride?: string;
  projectIdOverride?: string;
} = {}) {
  const params = useParams();
  const projectId = projectIdOverride ?? String(params.projectId);
  const leafId = leafIdOverride ?? String(params.leafId);
  return <LegacyLeafReader key={`${projectId}:${leafId}`} projectId={projectId} leafId={leafId} />;
}
