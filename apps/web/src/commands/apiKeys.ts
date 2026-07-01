import {
  createApiKey as createApiKeyInfra,
  type CreateT3xApiKeyInput,
  revokeApiKey as revokeApiKeyInfra,
} from "@/infrastructure/api-keys";

export function createApiKey(input: CreateT3xApiKeyInput) {
  return createApiKeyInfra(input);
}

export function revokeApiKey(id: string) {
  return revokeApiKeyInfra(id);
}
