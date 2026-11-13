import { useQuery } from '@/hooks/shared/useQuery';
import { getRepositoryObjectAddress } from '@/queries/repositoryObjectAddresses';

export function useRepositoryObjectAddressResolver() {
  return getRepositoryObjectAddress;
}

export function useRepositoryObjectAddress(
  projectId: string | undefined,
  kind: 'commit' | 'review',
  key: string | undefined
) {
  return useQuery({
    queryKey: ['repository-object-address', projectId, kind, key],
    queryFn: () => getRepositoryObjectAddress(projectId!, kind, key!),
    enabled: Boolean(projectId && key),
    staleTime: 0,
  });
}
