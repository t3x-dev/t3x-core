'use client';

import { HelpCircle, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { answerTreeQuestion } from '@/lib/api/trees';
import { useExtractionPanelStore } from '@/store/extractionPanelStore';

export function AdvisoryPanel() {
  const questions = useExtractionPanelStore((s) => s.advisoryQuestions);
  const setAdvisoryQuestions = useExtractionPanelStore((s) => s.setAdvisoryQuestions);
  const conversationId = useExtractionPanelStore((s) => s.conversationId);
  const applyDelta = useExtractionPanelStore((s) => s.applyDelta);

  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleDismiss = useCallback(
    (questionId: string) => {
      setAdvisoryQuestions(questions.filter((q) => q.id !== questionId));
    },
    [questions, setAdvisoryQuestions]
  );

  const handleSubmit = useCallback(
    async (questionId: string) => {
      const q = questions.find((q) => q.id === questionId);
      if (!q || !conversationId) return;

      const answerText = answerInputs[questionId]?.trim();
      if (!answerText) return;

      setSubmitting(questionId);
      try {
        const result = await answerTreeQuestion(
          conversationId,
          [{ question_id: questionId, answer_text: answerText }],
          { type: q.type as 'vagueness' | 'structural', tree_id: q.treeId, slot_key: q.slotKey }
        );

        if (result.applied && result.delta) {
          applyDelta(result.delta as import('@t3x-dev/core').Delta, 'answer');
        }

        // Remove answered question
        handleDismiss(questionId);
      } catch {
        // Answer failed — keep question visible
      } finally {
        setSubmitting(null);
      }
    },
    [questions, conversationId, answerInputs, applyDelta, handleDismiss]
  );

  if (questions.length === 0) return null;

  return (
    <div className="border-t border-[var(--stroke-default)] bg-[var(--surface-panel)] p-2">
      <div className="flex items-center gap-1.5 mb-2">
        <HelpCircle className="h-3.5 w-3.5 text-[var(--accent-commit)]" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Suggestions ({questions.length})
        </span>
      </div>

      <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
        {questions.map((q) => (
          <div
            key={q.id}
            className="rounded border border-[var(--stroke-default)] bg-[var(--surface-base)] p-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[var(--text-tertiary)] mb-0.5">
                  {q.type === 'vagueness' ? 'Vague value' : 'Structure'}
                  {q.slotKey && (
                    <span className="ml-1 font-mono">
                      {q.treeId}.{q.slotKey}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">{q.question}</div>
                {q.currentValue !== undefined && (
                  <div className="mt-0.5 text-[10px] font-mono text-[var(--text-tertiary)]">
                    Current: {String(q.currentValue)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDismiss(q.id)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex-shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="mt-1.5 flex gap-1">
              <input
                type="text"
                value={answerInputs[q.id] ?? ''}
                onChange={(e) => setAnswerInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Your answer..."
                className="flex-1 rounded border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-commit)]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(q.id);
                }}
              />
              <button
                type="button"
                onClick={() => handleSubmit(q.id)}
                disabled={submitting === q.id || !answerInputs[q.id]?.trim()}
                className="rounded bg-[var(--accent-commit)] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting === q.id ? '...' : 'Apply'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
