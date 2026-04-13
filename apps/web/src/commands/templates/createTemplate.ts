/**
 * L3 command — create a template.
 *
 * Thin wrapper over the infra adapter so the public write entry for the
 * templates aggregate lives at @/commands/templates (v2 §2.4). Callers in
 * hooks/ import from here; they must not reach past into @/infrastructure.
 */

import {
  type CreateTemplateInput,
  createTemplate as createTemplateInfra,
} from '@/infrastructure/misc';
import type { Template } from '@/types/api';

export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  return createTemplateInfra(input);
}

export type { CreateTemplateInput };
