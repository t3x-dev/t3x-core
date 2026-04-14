'use client';

/**
 * useExportTemplate — view-facing wrapper around exportTemplate.
 */

import { useCallback } from 'react';
import type { Template } from '@/types/api';
import {
  exportTemplate,
  type TemplateExportFormat,
} from '@/infrastructure/export/template';

export type { TemplateExportFormat };

export function useExportTemplate() {
  const run = useCallback(
    async (template: Template, format: TemplateExportFormat) => exportTemplate(template, format),
    []
  );
  return { run };
}
