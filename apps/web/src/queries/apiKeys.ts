import { listApiKeys as listApiKeysInfra } from '@/infrastructure/api-keys';

export function listApiKeys() {
  return listApiKeysInfra();
}
