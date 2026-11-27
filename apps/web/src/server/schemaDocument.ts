import { type RepositorySchemaStartup, RepositorySchemaStartupSchema } from '@t3x-dev/api-client';
import { SCHEMA_DOCUMENT_HEADER, schemaDocumentRoute } from '@/domain/schemas/schemaDocumentRoute';
import { schemaDocumentAuthorization } from '@/server/browserApiProxy';

export type SchemaDocumentStartup = RepositorySchemaStartup & {
  location: string;
};

export async function loadSchemaDocument(
  headers: Headers,
  owner: string,
  repository: string
): Promise<SchemaDocumentStartup | undefined> {
  const location = headers.get(SCHEMA_DOCUMENT_HEADER);
  if (!location) return;
  const query = location.indexOf('?');
  const route = schemaDocumentRoute(
    query < 0 ? location : location.slice(0, query),
    query < 0 ? '' : location.slice(query)
  );
  if (!route || route.owner !== owner || route.repository !== repository) return;

  try {
    const signal = AbortSignal.timeout(8_000);
    const authorization = await schemaDocumentAuthorization(headers, signal);
    if (authorization === undefined) return;
    const origin = process.env.T3X_API_URL || 'http://localhost:8000';
    const endpoint = new URL(
      `/api/v1/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/schema-startup`,
      origin
    );
    endpoint.searchParams.set('branch', route.branch);
    if (route.workspace) endpoint.searchParams.set('workspace', route.workspace);
    const response = await fetch(endpoint, {
      cache: 'no-store',
      redirect: 'error',
      headers: authorization ? { Authorization: `Bearer ${authorization}` } : undefined,
      signal,
    });
    if (!response.ok) return;
    const body = await response.json();
    if (body?.success !== true) return;
    const result = RepositorySchemaStartupSchema.safeParse(body.data);
    if (!result.success || !result.data.address.canonical_path || result.data.address.redirect)
      return;
    return { ...result.data, location };
  } catch {
    // Direct editing still works when upgrading Web and API separately.
    return;
  }
}
