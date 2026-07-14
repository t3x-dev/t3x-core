import { SchemaRegistry } from '@/components/schemas';
import { getSchemaRegistryPreview } from '@/data/schemaReleases';

interface ProjectSchemasTabProps {
  projectId: string;
}

export function ProjectSchemasTab({ projectId }: ProjectSchemasTabProps) {
  const registry = getSchemaRegistryPreview(projectId);

  return <SchemaRegistry key={projectId} {...registry} />;
}
