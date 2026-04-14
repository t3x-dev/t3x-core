/**
 * useAutopilot — imperative autopilot config + adaptive threshold loaders.
 */

import { useCallback } from 'react';
import {
  type AutopilotConfig,
  getAdaptiveThreshold,
  getAutopilotConfig,
  updateAutopilotConfig,
} from '@/infrastructure/autopilot';

export function useAutopilot() {
  const loadConfig = useCallback(async (projectId: string) => getAutopilotConfig(projectId), []);
  const saveConfig = useCallback(
    async (projectId: string, config: Partial<AutopilotConfig>) =>
      updateAutopilotConfig(projectId, config),
    []
  );
  const loadAdaptiveThreshold = useCallback(
    async (projectId: string) => getAdaptiveThreshold(projectId),
    []
  );
  return { loadConfig, saveConfig, loadAdaptiveThreshold };
}
