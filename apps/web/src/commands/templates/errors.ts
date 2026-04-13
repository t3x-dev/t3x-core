/**
 * L3 — typed errors for the templates aggregate (v2 §2.4 contract).
 *
 * Source policy: NONE. Templates are user-managed configuration
 * artefacts; no LLMSource / HumanSource concept applies.
 *
 * Optimistic-update style: all-or-nothing. Commands either resolve
 * cleanly (caller writes result via store setter) or throw
 * TemplatePersistenceError; the hook does not pre-mutate the store.
 */

import { CommandError } from '../CommandError';

export class TemplatePersistenceError extends CommandError {
  constructor(message: string, cause?: unknown) {
    super('template_persistence', message, cause);
    this.name = 'TemplatePersistenceError';
  }
}
