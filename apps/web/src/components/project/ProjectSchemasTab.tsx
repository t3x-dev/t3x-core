import { SchemaRegistry } from '@/components/schemas';
import { getSchemaReleasePreviews } from '@/data/schemaReleases';

export function ProjectSchemasTab({ projectId }: { projectId: string }) {
  return <SchemaRegistry releases={getSchemaReleasePreviews(projectId)} />;
}
