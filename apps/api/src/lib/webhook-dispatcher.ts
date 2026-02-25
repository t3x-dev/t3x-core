/**
 * Webhook Dispatcher
 *
 * Fire-and-forget POST to matching webhooks when events occur.
 * HMAC-SHA256 signature in X-T3X-Signature header when secret exists.
 * No persistence of dispatch results in v0 — log only.
 */

import { createHmac } from 'node:crypto';
import { findWebhooksByEvent } from '@t3x/storage/pglite';
import { getDB } from './db';
import { pinoLogger } from '../middleware/logger';

export interface WebhookEvent {
  event: string;
  payload: Record<string, unknown>;
  project_id?: string;
}

class WebhookDispatcher {
  /**
   * Dispatch an event to all matching webhooks.
   *
   * Fire-and-forget: does not await responses, logs results.
   */
  dispatch(event: string, payload: Record<string, unknown>, projectId?: string): void {
    // Run async dispatch without awaiting
    this.dispatchAsync({ event, payload, project_id: projectId }).catch((err) => {
      pinoLogger.error({ err, event }, 'Webhook dispatch failed');
    });
  }

  private async dispatchAsync(evt: WebhookEvent): Promise<void> {
    try {
      const db = await getDB();
      const matchingWebhooks = await findWebhooksByEvent(db, evt.event, evt.project_id);

      if (matchingWebhooks.length === 0) return;

      const body = JSON.stringify({
        event: evt.event,
        payload: evt.payload,
        timestamp: new Date().toISOString(),
      });

      const promises = matchingWebhooks.map(async (wh) => {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-T3X-Event': evt.event,
          };

          // HMAC-SHA256 signature when secret exists
          if (wh.secret) {
            const signature = createHmac('sha256', wh.secret).update(body).digest('hex');
            headers['X-T3X-Signature'] = signature;
          }

          const response = await fetch(wh.url, {
            method: 'POST',
            headers,
            body,
            signal: AbortSignal.timeout(10000),
          });

          pinoLogger.info(
            {
              webhook_id: wh.webhook_id,
              event: evt.event,
              status: response.status,
              url: wh.url,
            },
            'Webhook dispatched'
          );
        } catch (err) {
          pinoLogger.warn(
            {
              webhook_id: wh.webhook_id,
              event: evt.event,
              url: wh.url,
              err,
            },
            'Webhook delivery failed'
          );
        }
      });

      await Promise.allSettled(promises);
    } catch (err) {
      pinoLogger.error({ err, event: evt.event }, 'Webhook dispatch error');
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
