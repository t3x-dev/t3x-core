'use client';

import {
  CheckCircle2,
  GitCommit,
  Leaf,
  MessageSquare,
  MessageSquareQuote,
  Pin,
  XCircle,
} from 'lucide-react';
import { CommitYAMLDocument } from '@/components/commit/CommitYAMLDocument';
import type {
  ContextManifestFeedback,
  ContextManifestReference,
  ConversationContextManifest,
} from '@/types/api';

interface ContextManifestPanelProps {
  id: string;
  manifest: ConversationContextManifest | null;
  disabled?: boolean;
  onReferenceToggle: (pinId: string, included: boolean) => void | Promise<void>;
  onAssertionToggle: (
    pinId: string,
    assertionId: string,
    included: boolean
  ) => void | Promise<void>;
}

function referenceLabel(reference: ContextManifestReference): string {
  return reference.title ?? reference.id;
}

function feedbackLabel(feedback: ContextManifestFeedback): string {
  return feedback.lesson ?? feedback.details ?? feedback.id;
}

function ReferenceIcon({ type }: { type: ContextManifestReference['type'] }) {
  return type === 'leaf' ? (
    <Leaf size={13} className="text-[var(--accent-leaf)]" />
  ) : (
    <MessageSquare size={13} className="text-[var(--accent-conversation)]" />
  );
}

function ReferenceRow({
  reference,
  disabled,
  onReferenceToggle,
}: {
  reference: ContextManifestReference;
  disabled?: boolean;
  onReferenceToggle: ContextManifestPanelProps['onReferenceToggle'];
}) {
  const title = referenceLabel(reference);

  return (
    <label className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--hover-bg)]">
      <input
        type="checkbox"
        checked={reference.included}
        disabled={disabled}
        onChange={(event) => {
          void onReferenceToggle(reference.pin_id, event.target.checked);
        }}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[var(--stroke-default)] accent-[var(--accent-commit)]"
        aria-label={`Include ${title}`}
      />
      <ReferenceIcon type={reference.type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-[var(--text-primary)]">
          {title}
        </span>
        <span className="block truncate font-mono text-[10px] text-[var(--text-tertiary)]">
          {reference.pin_id}
        </span>
      </span>
      <span className="rounded-[var(--radius-sm)] bg-[var(--surface-app)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
        {reference.type}
      </span>
    </label>
  );
}

function FeedbackRow({
  feedback,
  referenceTitle,
  disabled,
  onAssertionToggle,
}: {
  feedback: ContextManifestFeedback;
  referenceTitle: string;
  disabled?: boolean;
  onAssertionToggle: ContextManifestPanelProps['onAssertionToggle'];
}) {
  const label = feedbackLabel(feedback);

  return (
    <label className="flex min-w-0 items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--hover-bg)]">
      <input
        type="checkbox"
        checked={feedback.selected}
        disabled={disabled}
        onChange={(event) => {
          void onAssertionToggle(feedback.pin_id, feedback.id, event.target.checked);
        }}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-[var(--stroke-default)] accent-[var(--accent-extract)]"
        aria-label={`Include feedback ${label}`}
      />
      <MessageSquareQuote size={13} className="mt-0.5 shrink-0 text-[var(--accent-extract)]" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-xs text-[var(--text-primary)]">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[var(--text-tertiary)]">
          {referenceTitle}
        </span>
      </span>
      {feedback.passed === true && (
        <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[var(--status-success)]" />
      )}
      {feedback.passed === false && (
        <XCircle size={13} className="mt-0.5 shrink-0 text-[var(--status-error)]" />
      )}
    </label>
  );
}

export function ContextManifestPanel({
  id,
  manifest,
  disabled,
  onReferenceToggle,
  onAssertionToggle,
}: ContextManifestPanelProps) {
  const referencesById = new Map(
    manifest?.references.map((reference) => [reference.id, referenceLabel(reference)]) ?? []
  );

  return (
    <section
      id={id}
      aria-label="Context manifest"
      className="absolute left-3 right-3 top-full z-30 mt-1 max-h-[min(70vh,620px)] overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--stroke-default)] bg-[var(--surface-elevated)] shadow-[var(--fx-shadow-lg)]"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--stroke-divider)] bg-[var(--surface-elevated)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Pin size={13} className="text-[var(--accent-conversation)]" />
          <h2 className="truncate text-xs font-semibold text-[var(--text-primary)]">
            Context Manifest
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)]">
          <span>{manifest?.sources.length ?? 0} sources</span>
          <span>{manifest?.token_estimate ?? 0} tokens</span>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-normal text-[var(--text-tertiary)]">
            <GitCommit size={11} />
            <span>Baseline YAML</span>
          </div>
          {manifest?.baseline.content ? (
            <div className="max-h-64 overflow-auto rounded-[var(--radius-lg)]">
              <CommitYAMLDocument content={manifest.baseline.content} />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--stroke-default)] px-3 py-4 text-center text-xs text-[var(--text-tertiary)]">
              No baseline commit.
            </div>
          )}
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)]">References</h3>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {manifest?.references.filter((reference) => reference.included).length ?? 0}/
              {manifest?.references.length ?? 0} included
            </span>
          </div>
          {manifest && manifest.references.length > 0 ? (
            <div className="space-y-0.5">
              {manifest.references.map((reference) => (
                <ReferenceRow
                  key={reference.pin_id}
                  reference={reference}
                  disabled={disabled}
                  onReferenceToggle={onReferenceToggle}
                />
              ))}
            </div>
          ) : (
            <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">No pinned references.</p>
          )}
        </section>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)]">Feedback</h3>
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {manifest?.feedback.filter((feedback) => feedback.included).length ?? 0}/
              {manifest?.feedback.length ?? 0} included
            </span>
          </div>
          {manifest && manifest.feedback.length > 0 ? (
            <div className="space-y-0.5">
              {manifest.feedback.map((feedback) => (
                <FeedbackRow
                  key={feedback.id}
                  feedback={feedback}
                  referenceTitle={
                    referencesById.get(feedback.parent_ref_id) ?? feedback.parent_ref_id
                  }
                  disabled={disabled}
                  onAssertionToggle={onAssertionToggle}
                />
              ))}
            </div>
          ) : (
            <p className="px-2 py-1.5 text-xs text-[var(--text-tertiary)]">
              No feedback assertions.
            </p>
          )}
        </section>

        <section className="border-t border-[var(--stroke-divider)] pt-2">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Nodes</dt>
              <dd className="font-mono text-[var(--text-secondary)]">
                {manifest?.baseline.node_count ?? 0}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Relations</dt>
              <dd className="font-mono text-[var(--text-secondary)]">
                {manifest?.baseline.relation_count ?? 0}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Chat chars</dt>
              <dd className="font-mono text-[var(--text-secondary)]">
                {manifest?.chat_context_text.length ?? 0}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-tertiary)]">Extract chars</dt>
              <dd className="font-mono text-[var(--text-secondary)]">
                {manifest?.extraction_context_text.length ?? 0}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
