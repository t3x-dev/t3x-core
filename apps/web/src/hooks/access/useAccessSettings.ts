"use client";

import { useCallback } from "react";
import {
  createApiKey as createApiKeyCommand,
  revokeApiKey as revokeApiKeyCommand,
} from "@/commands/apiKeys";
import {
  checkLocalAccess as checkLocalAccessCommand,
  clearLocalApiKey as clearLocalApiKeyCommand,
  saveLocalConfig as saveLocalConfigCommand,
} from "@/commands/localConfig";
import type { CreateT3xApiKeyInput } from "@/domain/apiKeys";
import { listApiKeys as listApiKeysQuery } from "@/queries/apiKeys";
import { fetchLocalConfig as fetchLocalConfigQuery } from "@/queries/localConfig";

export function useAccessSettings() {
  const fetchLocalConfig = useCallback(() => fetchLocalConfigQuery(), []);
  const listApiKeys = useCallback(() => listApiKeysQuery(), []);
  const saveLocalConfig = useCallback(
    (input: { api_url?: string; api_key?: string }) =>
      saveLocalConfigCommand(input),
    []
  );
  const createApiKey = useCallback(
    (input: CreateT3xApiKeyInput) => createApiKeyCommand(input),
    []
  );
  const revokeApiKey = useCallback((id: string) => revokeApiKeyCommand(id), []);
  const clearLocalApiKey = useCallback(() => clearLocalApiKeyCommand(), []);
  const checkLocalAccess = useCallback(() => checkLocalAccessCommand(), []);

  return {
    fetchLocalConfig,
    listApiKeys,
    saveLocalConfig,
    createApiKey,
    revokeApiKey,
    clearLocalApiKey,
    checkLocalAccess,
  };
}
