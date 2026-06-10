'use client';

/**
 * useLeafValidate — owns the validate-output flow: isValidating /
 * validateError / semanticWarning + handleValidate trigger.
 *
 * Extracted from useLeafPageData (PR22).
 */

import { useCallback, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { validateLeafOutput } from '@/infrastructure';
import type { Leaf } from '@/types/api';

export interface UseLeafValidateReturn {
  isValidating: boolean;
  validateError: string | null;
  semanticWarning: boolean;
  handleValidate: () => Promise<void>;
}

export function useLeafValidate(
  leaf: Leaf | null,
  leafId: string,
  setLeaf: (leaf: Leaf | null) => void
): UseLeafValidateReturn {
  const [isValidating, setIsValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [semanticWarning, setSemanticWarning] = useState(false);

  const handleValidate = useCallback(async () => {
    if (!leaf || !leaf.output) return;
    setIsValidating(true);
    setValidateError(null);
    setSemanticWarning(false);
    try {
      const result = await validateLeafOutput(leafId);
      setLeaf(result.leaf);
      const hasSemanticConstraints = leaf.constraints.some((c) => c.match_mode === 'semantic');
      if (hasSemanticConstraints) {
        setSemanticWarning(true);
      }
    } catch (err) {
      setValidateError(formatUserFacingError(err, 'Validation failed.'));
    } finally {
      setIsValidating(false);
    }
  }, [leaf, leafId, setLeaf]);

  return { isValidating, validateError, semanticWarning, handleValidate };
}
