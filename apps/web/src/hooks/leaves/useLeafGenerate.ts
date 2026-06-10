'use client';

/**
 * useLeafGenerate — owns the generate-output flow: phase timer,
 * success banner, error handling, and the handleGenerate trigger.
 *
 * Extracted from useLeafPageData (PR22).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUserFacingError } from '@/domain/format/errors';
import { dispatchLeafChanged } from '@/hooks/leaves/leafEvents';
import { generateLeafOutput, getLeaf } from '@/infrastructure';
import type { Leaf } from '@/types/api';

export interface UseLeafGenerateReturn {
  isGenerating: boolean;
  generatePhase: number;
  generateProgressMessages: string[];
  generateError: string | null;
  generateSuccessBanner: string | null;
  handleGenerate: () => Promise<void>;
}

export function useLeafGenerate(
  leaf: Leaf | null,
  leafId: string,
  setLeaf: (leaf: Leaf | null) => void
): UseLeafGenerateReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatePhase, setGeneratePhase] = useState(0);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateSuccessBanner, setGenerateSuccessBanner] = useState<string | null>(null);
  const generateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const generateProgressMessages = useMemo(
    () => [
      'Preparing context...',
      'Generating output...',
      'Validating constraints...',
      'Finalizing...',
    ],
    []
  );

  // Cycle through generate phases every 8s while generating.
  useEffect(() => {
    if (!isGenerating) {
      setGeneratePhase(0);
      if (generateTimerRef.current) clearInterval(generateTimerRef.current);
      return;
    }
    generateTimerRef.current = setInterval(() => {
      setGeneratePhase((p) => Math.min(p + 1, generateProgressMessages.length - 1));
    }, 8000);
    return () => {
      if (generateTimerRef.current) clearInterval(generateTimerRef.current);
    };
  }, [isGenerating, generateProgressMessages]);

  // Cleanup banner timer on unmount.
  useEffect(() => {
    return () => {
      clearTimeout(bannerTimerRef.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!leaf) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      await generateLeafOutput(leafId);
      const updatedLeaf = await getLeaf(leafId);
      setLeaf(updatedLeaf);
      dispatchLeafChanged({
        projectId: updatedLeaf.project_id,
        commitHash: updatedLeaf.commit_hash,
        leafId,
        reason: 'generated',
      });
      if (updatedLeaf.output) {
        const wordCount = updatedLeaf.output.trim().split(/\s+/).length;
        setGenerateSuccessBanner(`Output ready — ${wordCount} words`);
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = setTimeout(() => setGenerateSuccessBanner(null), 3000);
      }
    } catch (err) {
      setGenerateError(formatUserFacingError(err, 'Generation failed.'));
    } finally {
      setIsGenerating(false);
    }
  }, [leaf, leafId, setLeaf]);

  return {
    isGenerating,
    generatePhase,
    generateProgressMessages,
    generateError,
    generateSuccessBanner,
    handleGenerate,
  };
}
