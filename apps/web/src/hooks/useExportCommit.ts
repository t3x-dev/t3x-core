'use client';

/**
 * useExportCommit — view-facing wrapper around exportCommit so
 * NodeModal components don't import @/infrastructure/export directly.
 */

import { useCallback } from 'react';
import type { ApiCommit } from '@/types/api';
import {
  type CommitExportFormat,
  exportCommit,
} from '@/infrastructure/export/commit';

export type { CommitExportFormat };

export function useExportCommit() {
  const run = useCallback(
    async (commit: ApiCommit, format: CommitExportFormat) => exportCommit(commit, format),
    []
  );
  return { run };
}
