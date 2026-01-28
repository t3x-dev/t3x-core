'use client';

/**
 * CommitSourceContext - Displays commit sentences with source context
 *
 * Instead of showing isolated sentences, this component displays the original
 * conversation turns with the committed sentences highlighted in green.
 *
 * Features:
 * - Groups sentences by turn_hash
 * - Fetches turn context from API
 * - Merges overlapping/adjacent highlights
 * - Shows turn separators between different turns
 * - Graceful fallback to sentence list on error
 */

import { AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  TurnBubble,
  type TurnBubbleData,
  type TurnHighlight,
} from '@/components/shared/TurnBubble';
import type { TurnContextData } from '@/lib/api';
import * as api from '@/lib/api';

/**
 * Sentence from commit content
 */
interface CommitSentence {
  id: string;
  text: string;
  source: {
    turn_hash: string;
    start_char: number;
    end_char: number;
  };
}

interface CommitSourceContextProps {
  /** Sentences from commit content */
  sentences: CommitSentence[];
  /** Compact mode for canvas preview (show first 2 turns only) */
  compact?: boolean;
}

/**
 * Group sentences by turn_hash
 */
function groupSentencesByTurn(sentences: CommitSentence[]): Map<string, TurnHighlight[]> {
  const groups = new Map<string, TurnHighlight[]>();

  for (const sentence of sentences) {
    const turnHash = sentence.source.turn_hash;
    if (!turnHash) continue;

    const highlights = groups.get(turnHash) || [];
    highlights.push({
      start: sentence.source.start_char,
      end: sentence.source.end_char,
    });
    groups.set(turnHash, highlights);
  }

  return groups;
}

/**
 * Turn data with fetched context and highlights
 */
interface TurnWithHighlights {
  turnHash: string;
  context: TurnContextData | null;
  highlights: TurnHighlight[];
  loading: boolean;
  error: string | null;
}

export function CommitSourceContext({ sentences, compact = false }: CommitSourceContextProps) {
  const [turnData, setTurnData] = useState<Map<string, TurnWithHighlights>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Group sentences by turn
  const sentencesByTurn = useMemo(() => groupSentencesByTurn(sentences), [sentences]);

  // Get ordered list of unique turn hashes
  const turnHashes = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const sentence of sentences) {
      const hash = sentence.source.turn_hash;
      if (hash && !seen.has(hash)) {
        seen.add(hash);
        ordered.push(hash);
      }
    }
    return ordered;
  }, [sentences]);

  // Fetch context for each unique turn
  useEffect(() => {
    if (turnHashes.length === 0) {
      setIsLoading(false);
      return;
    }

    const fetchAllContexts = async () => {
      setIsLoading(true);

      const newData = new Map<string, TurnWithHighlights>();

      // Limit turns in compact mode
      const hashesToFetch = compact ? turnHashes.slice(0, 2) : turnHashes;

      await Promise.all(
        hashesToFetch.map(async (turnHash) => {
          const highlights = sentencesByTurn.get(turnHash) || [];

          try {
            // Fetch with minimal context window (just the target turn)
            const context = await api.fetchTurnContext(turnHash, {
              before: 0,
              after: 0,
            });

            newData.set(turnHash, {
              turnHash,
              context,
              highlights,
              loading: false,
              error: null,
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load context';
            newData.set(turnHash, {
              turnHash,
              context: null,
              highlights,
              loading: false,
              error: errorMsg,
            });
          }
        })
      );

      setTurnData(newData);
      setIsLoading(false);
    };

    fetchAllContexts();
  }, [turnHashes, sentencesByTurn, compact]);

  // Handle empty sentences
  if (sentences.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-gray-400" />
          <h3 className="font-semibold text-sm text-gray-700">Source Context</h3>
        </div>
        <p className="text-center py-4 text-gray-400 text-sm">No sentences</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={14} className="text-gray-400" />
          <h3 className="font-semibold text-sm text-gray-700">Source Context</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading source context...</span>
        </div>
      </div>
    );
  }

  // Check if any context was loaded successfully
  const hasAnyContext = Array.from(turnData.values()).some((data) => data.context !== null);

  // Fallback to sentence list if no context could be loaded
  if (!hasAnyContext) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-500" />
            <h3 className="font-semibold text-sm text-gray-700">Sentences</h3>
          </div>
          <span className="text-xs text-gray-400">
            {sentences.length} total (context unavailable)
          </span>
        </div>
        <ul className="space-y-2">
          {sentences.map((s) => (
            <li
              key={s.id}
              className="flex items-start gap-2 p-2 bg-white rounded border border-gray-100"
            >
              <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                {s.id}
              </span>
              <span className="text-[0.875rem] leading-relaxed text-gray-700 break-words">
                {s.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Render turns with context
  const hashesToRender = compact ? turnHashes.slice(0, 2) : turnHashes;

  return (
    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-green-600" />
          <h3 className="font-semibold text-sm text-gray-700">Source Context</h3>
        </div>
        <span className="text-xs text-gray-400">
          {sentences.length} sentence{sentences.length !== 1 ? 's' : ''} from {turnHashes.length}{' '}
          turn{turnHashes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {hashesToRender.map((turnHash, idx) => {
          const data = turnData.get(turnHash);

          if (!data || data.error) {
            // Show error state for this turn
            return (
              <div key={turnHash} className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-2 text-amber-700 text-sm">
                  <AlertCircle size={14} />
                  <span>Could not load turn context</span>
                </div>
                <p className="mt-1 text-xs font-mono text-amber-500 truncate">{turnHash}</p>
              </div>
            );
          }

          const targetTurn = data.context?.target_turn;
          if (!targetTurn) return null;

          // Convert to TurnBubbleData with highlights
          const turnBubbleData: TurnBubbleData = {
            turn_hash: targetTurn.turn_hash,
            role: targetTurn.role,
            content: targetTurn.content,
            created_at: targetTurn.created_at,
            is_target: true,
            highlights: data.highlights,
          };

          return (
            <div key={turnHash}>
              {idx > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs text-gray-400">
                    {data.context?.conversation_title || 'Conversation'}
                  </span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
              )}
              <TurnBubble turn={turnBubbleData} highlightColor="green" showTargetRing={false} />
            </div>
          );
        })}

        {/* Show indicator if there are more turns in compact mode */}
        {compact && turnHashes.length > 2 && (
          <div className="text-center py-2 text-xs text-gray-400">
            +{turnHashes.length - 2} more turn
            {turnHashes.length - 2 !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
