/**
 * n8n Workflow Trigger Helper
 *
 * Triggers n8n workflows via webhook.
 */

import pino from 'pino';
import type { EngineRunRequest } from './types.js';
import { fetchWithRetry } from './utils/retry.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

// n8n webhook base URL (used when webhook_id is not a full URL)
const N8N_WEBHOOK_BASE = process.env.N8N_WEBHOOK_URL || 'http://n8n:5678/webhook';

/**
 * Trigger an n8n workflow via webhook
 *
 * This is a fire-and-forget operation. The n8n workflow will call back
 * to the Runner's /callbacks/n8n endpoint when complete.
 */
export async function triggerN8nWorkflow(
  data: EngineRunRequest,
  runner_run_id: string
): Promise<void> {
  const webhookId = data.workflow?.webhook_id;

  if (!webhookId) {
    logger.warn({ run_id: data.run_id }, 'No webhook_id provided, skipping n8n trigger');
    return;
  }

  // If webhook_id is a full URL, use it directly (with Docker host replacement)
  // Otherwise, append it to the base URL
  let webhookUrl: string;
  if (webhookId.startsWith('http://') || webhookId.startsWith('https://')) {
    // Replace localhost with Docker service name for container networking
    webhookUrl = webhookId
      .replace('localhost:5678', 'n8n:5678')
      .replace('127.0.0.1:5678', 'n8n:5678');
  } else {
    webhookUrl = `${N8N_WEBHOOK_BASE}/${webhookId}`;
  }

  const payload = {
    run_id: data.run_id,
    runner_run_id,
    commit_ref: data.commit_ref,
    leaf: data.leaf,
    inputs: data.inputs,
    callback_url: data.callback_url,
  };

  logger.info(
    { run_id: data.run_id, runner_run_id, webhook_url: webhookUrl },
    'Triggering n8n workflow'
  );

  try {
    const response = await fetchWithRetry(
      webhookUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      },
      { maxRetries: 3, operationName: 'n8n webhook' }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { run_id: data.run_id, status: response.status, error: errorText },
        'n8n webhook returned error'
      );
    } else {
      logger.info({ run_id: data.run_id, runner_run_id }, 'n8n workflow triggered successfully');
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(
      { run_id: data.run_id, error: errorMsg },
      'Failed to trigger n8n workflow after retries'
    );
    // Don't throw - this is fire-and-forget
    // The Engine will timeout and mark the run as failed if n8n doesn't respond
  }
}
