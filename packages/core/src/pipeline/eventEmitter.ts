/**
 * Pipeline EventEmitter (Step 7)
 *
 * Lightweight, type-safe event emitter for pipeline lifecycle events.
 * Zero external dependencies. Listeners are fire-and-forget (non-blocking).
 */

import type { SemanticContent } from '../semantic/types';
import type { YOp } from '../t3x-yops/types';
import type { AdvisoryQuestion } from './types';

// ── Event Payload Types ──

export interface ExtractionCompletedEvent {
  conversationId: string;
  projectId: string;
  yopsLogId: string;
  yops: YOp[];
  snapshot: SemanticContent;
  topicId?: string;
}

export interface QuestionGeneratedEvent {
  conversationId: string;
  questions: AdvisoryQuestion[];
}

export interface TopicChangedEvent {
  conversationId: string;
  oldTopic?: string;
  newTopic: string;
}

// ── Event Map ──

export interface PipelineEventMap {
  'extraction.completed': ExtractionCompletedEvent;
  'question.generated': QuestionGeneratedEvent;
  'topic.changed': TopicChangedEvent;
}

// ── EventEmitter ──

type Listener<T> = (event: T) => void | Promise<void>;

export class PipelineEventEmitter {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  /** Subscribe to an event */
  on<K extends keyof PipelineEventMap>(event: K, listener: Listener<PipelineEventMap[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);
  }

  /** Unsubscribe from an event */
  off<K extends keyof PipelineEventMap>(event: K, listener: Listener<PipelineEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  /** Emit an event (fire-and-forget, does not block caller) */
  emit<K extends keyof PipelineEventMap>(event: K, payload: PipelineEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of set) {
      try {
        const result = fn(payload);
        // Swallow async errors to avoid blocking the pipeline
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err) => {
            console.warn(`[PipelineEventEmitter] async listener error on "${event}":`, err);
          });
        }
      } catch (err) {
        console.warn(`[PipelineEventEmitter] sync listener error on "${event}":`, err);
      }
    }
  }

  /** Remove all listeners (useful for testing) */
  clear(): void {
    this.listeners.clear();
  }
}

/** Shared singleton — import this in API routes to subscribe or emit */
export const pipelineEmitter = new PipelineEventEmitter();
