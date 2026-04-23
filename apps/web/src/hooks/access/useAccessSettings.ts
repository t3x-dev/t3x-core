'use client';

import { useCallback } from 'react';
import {
  checkLocalAccess as checkLocalAccessCommand,
  clearLocalApiKey as clearLocalApiKeyCommand,
  saveLocalConfig as saveLocalConfigCommand,
} from '@/commands/localConfig';
import { fetchLocalConfig as fetchLocalConfigQuery } from '@/queries/localConfig';

export function useAccessSettings() {
  const fetchLocalConfig = useCallback(() => fetchLocalConfigQuery(), []);
  const saveLocalConfig = useCallback(
    (input: { api_url?: string; api_key?: string }) => saveLocalConfigCommand(input),
    []
  );
  const clearLocalApiKey = useCallback(() => clearLocalApiKeyCommand(), []);
  const checkLocalAccess = useCallback(() => checkLocalAccessCommand(), []);

  return {
    fetchLocalConfig,
    saveLocalConfig,
    clearLocalApiKey,
    checkLocalAccess,
  };
}
