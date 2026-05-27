/**
 * L3 material readers.
 */

import { getMaterialDetail, listMaterialsByProject } from '@/infrastructure/materials';
import type { Material, MaterialDetail } from '@/types/api';

export function fetchMaterialsByProject(projectId: string): Promise<Material[]> {
  return listMaterialsByProject(projectId);
}

export function fetchMaterialDetail(
  projectId: string,
  materialId: string
): Promise<MaterialDetail> {
  return getMaterialDetail(projectId, materialId);
}
