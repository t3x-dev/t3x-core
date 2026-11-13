import { useQuery } from '@/hooks/shared/useQuery';
import { getAdaptiveThreshold } from '@/infrastructure/autopilot';

export function useAutopilotSuggestions(projectId: string) {
  return useQuery({
    queryKey: ['autopilot-threshold-suggestions', projectId],
    queryFn: () => getAdaptiveThreshold(projectId),
    staleTime: 0,
  });
}
