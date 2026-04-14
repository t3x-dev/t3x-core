'use client';

/**
 * useLeafExport — owns the export-to-file flow (PDF/md/...).
 *
 * Extracted from useLeafPageData (PR22).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type ExportFormat, exportLeaf } from '@/infrastructure/export/core';
import type { Leaf } from '@/types/api';

export interface UseLeafExportReturn {
  exportMessage: { type: 'success' | 'error'; text: string } | null;
  handleExport: (format: ExportFormat) => Promise<void>;
}

export function useLeafExport(
  leafRef: React.MutableRefObject<Leaf | null>
): UseLeafExportReturn {
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(exportTimerRef.current);
    };
  }, []);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const current = leafRef.current;
      if (!current) return;
      try {
        const result = await exportLeaf(current, format);
        setExportMessage({
          type: result.success ? 'success' : 'error',
          text: result.message,
        });
        if (result.success) {
          clearTimeout(exportTimerRef.current);
          exportTimerRef.current = setTimeout(() => setExportMessage(null), 3000);
        }
      } catch {
        setExportMessage({ type: 'error', text: 'Export failed' });
      }
    },
    [leafRef]
  );

  return { exportMessage, handleExport };
}
