'use client';

import { useCallback } from 'react';
import { clearLocalApiKey as clearLocalApiKeyCommand, saveLocalConfig as saveLocalConfigCommand } from '@/commands/localConfig';
import { fetchLocalConfig as fetchLocalConfigQuery } from '@/queries/localConfig';

export function useAccessSettings() {
  const fetchLocalConfig = useCallback(() => fetchLocalConfigQuery(), []);
  const saveLocalConfig = useCallback((input: { api_url?: string; api_key?: string }) => saveLocalConfigCommand(input), []);
  const clearLocalApiKey = useCallback(() => clearLocalApiKeyCommand(), []);

  return {
    fetchLocalConfig,
    saveLocalConfig,
    clearLocalApiKey,
  };
}
