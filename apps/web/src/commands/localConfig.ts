import {
  deleteLocalApiKey,
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
