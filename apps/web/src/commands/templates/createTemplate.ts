/**
 * L3 command — create a template.
 *
 * Thin wrapper over the infra adapter so the public write entry for
 * the templates aggregate lives at @/commands/templates (v2 §2.4).
 * Wraps infra errors in TemplatePersistenceError so callers can
 * pattern-match on `instanceof CommandError` without inspecting raw
 * HTTP errors.
 */

import {
  type CreateTemplateInput,
  createTemplate as createTemplateInfra,
} from '@/infrastructure/misc';
import type { Template } from '@/types/api';
import { TemplatePersistenceError } from './errors';

export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  try {
    return await createTemplateInfra(input);
  } catch (cause) {
    throw new TemplatePersistenceError(
      cause instanceof Error ? cause.message : 'createTemplate failed',
      cause
    );
  }
}

export type { CreateTemplateInput };
