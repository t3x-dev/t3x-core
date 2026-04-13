/**
 * L3 command — delete a template by id.
 */

import { deleteTemplate as deleteTemplateInfra } from '@/infrastructure/misc';

export async function deleteTemplate(id: string): Promise<{ deleted: true }> {
  return deleteTemplateInfra(id);
}
