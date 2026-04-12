/**
 * L3 — imperative template-list fetcher.
 */

import { listTemplates } from '@/lib/api/misc';
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
