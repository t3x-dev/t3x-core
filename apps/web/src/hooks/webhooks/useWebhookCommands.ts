import { useCallback } from 'react';
import {
  createWebhook as createWebhookInfra,
  deleteWebhook as deleteWebhookInfra,
  listWebhooks as listWebhooksInfra,
  testWebhook as testWebhookInfra,
  updateWebhook as updateWebhookInfra,
} from '@/infrastructure';
import type { CreateWebhookInput, UpdateWebhookInput, WebhookData } from '@/types/api';

export function useWebhookCommands() {
  const listWebhooks = useCallback((): Promise<WebhookData[]> => {
    return listWebhooksInfra();
  }, []);

  const createWebhook = useCallback((input: CreateWebhookInput): Promise<WebhookData> => {
    return createWebhookInfra(input);
  }, []);

  const updateWebhook = useCallback(
    (id: string, input: UpdateWebhookInput): Promise<WebhookData> => {
      return updateWebhookInfra(id, input);
    },
    []
  );

  const deleteWebhook = useCallback((id: string): Promise<void> => {
    return deleteWebhookInfra(id);
  }, []);

  const testWebhook = useCallback((id: string): Promise<{ status: number; ok: boolean }> => {
    return testWebhookInfra(id);
  }, []);

  return {
    listWebhooks,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
  };
}
