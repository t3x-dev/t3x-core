/**
 * L3 — imperative template-list fetcher.
 */

import {
  type CreateTemplateInput,
  createTemplate,
  deleteTemplate,
  listTemplates,
} from '@/lib/api/misc';
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

export function createTemplateApi(input: CreateTemplateInput): Promise<Template> {
  return createTemplate(input);
}

export function deleteTemplateById(id: string): Promise<{ deleted: true }> {
  return deleteTemplate(id);
}

export type { CreateTemplateInput };
