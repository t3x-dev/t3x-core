/**
 * L3 command — delete a template by id.
 */

import { deleteTemplate as deleteTemplateInfra } from '@/infrastructure/misc';
import { TemplatePersistenceError } from './errors';

export async function deleteTemplate(id: string): Promise<{ deleted: true }> {
  try {
    return await deleteTemplateInfra(id);
  } catch (cause) {
    throw new TemplatePersistenceError(
      cause instanceof Error ? cause.message : 'deleteTemplate failed',
      cause
    );
  }
}
