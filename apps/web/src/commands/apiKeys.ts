import {
  type CreateT3xApiKeyInput,
  createApiKey as createApiKeyInfra,
  revokeApiKey as revokeApiKeyInfra,
} from '@/infrastructure/api-keys';

export function createApiKey(input: CreateT3xApiKeyInput) {
  return createApiKeyInfra(input);
}

export function revokeApiKey(id: string) {
  return revokeApiKeyInfra(id);
}
