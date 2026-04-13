/**
 * L3 — imperative template-list fetcher (read-only).
 *
 * Writes (create, delete) live in @/commands/templates per v2 §2.4.
 */

import { listTemplates } from '@/infrastructure/misc';
import type { Template } from '@/types/api';

export interface FetchTemplatesOptions {
  category?: string;
  leaf_type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function fetchTemplates(options?: FetchTemplatesOptions): Promise<Template[]> {
  return listTemplates(options);
}
