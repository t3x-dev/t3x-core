/**
 * Webhook Dispatcher
 *
 * Fire-and-forget POST to matching webhooks when events occur.
 * HMAC-SHA256 signature in X-T3X-Signature header when secret exists.
 * No persistence of dispatch results in v0 — log only.
 */

import { createHmac } from 'node:crypto';
import { findRecipesByEvent, findWebhooksByEvent } from '@t3x/storage/pglite';
import { pinoLogger } from '../middleware/logger';
import { getDB } from './db';
import { executeRecipe } from './recipe-executor';
import { isInternalUrl } from './ssrf';

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

      if (matchingWebhooks.length === 0) {
        // No webhooks, but still check for matching recipes
        if (evt.project_id) {
          await this.triggerRecipes(evt);
        }
        return;
      }

      const body = JSON.stringify({
        event: evt.event,
        payload: evt.payload,
        timestamp: new Date().toISOString(),
      });

      const promises = matchingWebhooks.map(async (wh) => {
        try {
          if (isInternalUrl(wh.url)) {
            pinoLogger.warn(
              { webhook_id: wh.webhook_id, url: wh.url, event: evt.event },
              'Webhook delivery blocked: URL targets internal address'
            );
            return;
          }

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

      // Also trigger matching recipes for this event
      if (evt.project_id) {
        await this.triggerRecipes(evt);
      }
    } catch (err) {
      pinoLogger.error({ err, event: evt.event }, 'Webhook dispatch error');
    }
  }

  /**
   * Find and execute matching recipes for the given event.
   * Fire-and-forget — errors are logged but don't propagate.
   */
  private async triggerRecipes(evt: WebhookEvent): Promise<void> {
    if (!evt.project_id) return;

    try {
      const db = await getDB();
      const matchingRecipes = await findRecipesByEvent(db, evt.project_id, evt.event);

      if (matchingRecipes.length === 0) return;

      const webhookDispatch = async (url: string, payload: unknown): Promise<void> => {
        if (isInternalUrl(url)) {
          pinoLogger.warn(
            { url, event: evt.event },
            'Recipe webhook dispatch blocked: URL targets internal address'
          );
          return;
        }
        const body = JSON.stringify(payload);
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-T3X-Event': evt.event },
          body,
          signal: AbortSignal.timeout(10000),
        });
      };

      for (const recipe of matchingRecipes) {
        try {
          const results = await executeRecipe(
            { id: recipe.id, name: recipe.name, steps: recipe.steps },
            { projectId: evt.project_id, event: evt.event, payload: evt.payload },
            { webhookDispatch }
          );

          pinoLogger.info(
            { recipe_id: recipe.id, recipe_name: recipe.name, event: evt.event, results },
            'Recipe executed'
          );
        } catch (err) {
          pinoLogger.warn(
            { recipe_id: recipe.id, recipe_name: recipe.name, event: evt.event, err },
            'Recipe execution failed'
          );
        }
      }
    } catch (err) {
      pinoLogger.error({ err, event: evt.event }, 'Recipe trigger error');
    }
  }
}

export const webhookDispatcher = new WebhookDispatcher();
