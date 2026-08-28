import {
  createPersonalNamespace as createPersonalNamespaceInfra,
  type NamespaceProfile,
} from '@/infrastructure/namespaces';

export async function createPersonalNamespace(slug: string): Promise<NamespaceProfile> {
  return createPersonalNamespaceInfra(slug);
}
