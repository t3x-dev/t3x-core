'use client';

/**
 * useExportTemplate — view-facing wrapper around exportTemplate.
 */

import { useCallback } from 'react';
import { exportTemplate, type TemplateExportFormat } from '@/infrastructure/export/template';
import type { Template } from '@/types/api';

export type { TemplateExportFormat };

export function useExportTemplate() {
  const run = useCallback(
    async (template: Template, format: TemplateExportFormat) => exportTemplate(template, format),
    []
  );
  return { run };
}
