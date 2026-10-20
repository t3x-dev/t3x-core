import { type AnyDB, findNamespaceById, findProjectById } from '@t3x-dev/storage';
import type { Context } from 'hono';
import { assertNamespaceAccess } from './namespace-access';
import { StudioError } from './schema-studio-preview';

/** Public read access is unconditional; publishing still requires namespace write authority. */
export async function resolveSchemaPublisher(c: Context, db: AnyDB, projectId: string) {
  const project = await findProjectById(db, projectId);
  const namespace = project?.namespaceId ? await findNamespaceById(db, project.namespaceId) : null;
  if (!namespace)
    throw new StudioError('FORBIDDEN', 'Claim this repository in a namespace before publishing.');
  if ((await assertNamespaceAccess(c, db, namespace, 'project:create')) instanceof Response)
    throw new StudioError('FORBIDDEN', 'Namespace publishing authority is required.');
  return namespace.namespaceId;
}
