/**
 * L3 material readers.
 */

import { listMaterialsByProject } from '@/infrastructure/materials';
import type { Material } from '@/types/api';

export function fetchMaterialsByProject(projectId: string): Promise<Material[]> {
  return listMaterialsByProject(projectId);
}
