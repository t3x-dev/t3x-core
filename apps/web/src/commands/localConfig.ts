import {
  checkLocalAccess as checkLocalAccessInfra,
  deleteLocalApiKey,
  type LocalAccessCheckResult,
  type LocalConfigState,
  type UpdateLocalConfigInput,
  updateLocalConfig,
} from '@/infrastructure/local-config';

export function saveLocalConfig(input: UpdateLocalConfigInput): Promise<LocalConfigState> {
  return updateLocalConfig(input);
}

export function clearLocalApiKey(): Promise<LocalConfigState> {
  return deleteLocalApiKey();
}

export function checkLocalAccess(): Promise<LocalAccessCheckResult> {
  return checkLocalAccessInfra();
}
