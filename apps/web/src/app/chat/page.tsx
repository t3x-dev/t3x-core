'use client';

import { FileText, GitCommitHorizontal, Sparkles } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import { ProviderSetupBanner } from '@/components/chat/ProviderSetupBanner';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useChatStore } from '@/store/chatStore';

const STARTER_CARDS = [
  {
    icon: FileText,
    title: 'Capture source',
    description: 'Paste notes, files, links, or raw context.',
    prompt: 'I want T3X to make sense of this source material:\n\n',
    tone: 'source',
  },
  {
    icon: Sparkles,
    title: 'Shape meaning',
    description: 'Find decisions, facts, risks, and tensions.',
    prompt: 'Help me shape the meaning in this context:\n\n',
    tone: 'meaning',
  },
  {
    icon: GitCommitHorizontal,
    title: 'Create checkpoint',
    description: 'Save durable meaning as a versioned commit.',
    prompt: 'Create a semantic checkpoint from this work:\n\n',
    tone: 'commit',
  },
] as const;

const FLOW_STEPS = ['Source', 'Meaning', 'Commit'] as const;

const ICON_TONE_CLASSES = {
  source: 'border-[var(--source)]/20 bg-[var(--source-dim)] text-[var(--source)]',
  meaning: 'border-[var(--accent-extract)]/20 bg-[var(--source-dim)] text-[var(--accent-extract)]',
  commit:
    'border-[var(--accent-commit)]/20 bg-[var(--accent-commit)]/10 text-[var(--accent-commit)]',
} as const;

export default function ChatLandingPage() {
  // useSearchParams forces a CSR bailout in Next 16 — wrap in Suspense so
  // the surrounding shell can still prerender. Fallback is `null` because
  // the page is essentially a blank composer until hydration anyway.
  return (
    <Suspense fallback={null}>
      <ChatLanding />
    </Suspense>
  );
}

function ChatLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Anchor this landing to a specific project when one was passed in the
  // URL (e.g. the "+ New Project" sidebar action lands here so the user can
  // type their first message). Priming the store keeps activeProjectId in
  // sync for the sidebar; propagating the param to /chat/new survives
  // refresh and avoids relying solely on in-memory state.
  const projectIdParam = searchParams.get('projectId');
  useEffect(() => {
    if (!projectIdParam) return;
    const store = useChatStore.getState();
    if (store.activeProjectId !== projectIdParam) {
      store.setActiveConversation(null, projectIdParam);
    }
  }, [projectIdParam]);

  const {
    loading,
    hasConfiguredGenerationProvider,
    selectedProvider,
    selectedModel,
    handleModelChange,
    availabilityError,
  } = useChatModelSelection({});

  const handleSend = useCallback(
    (message: string) => {
      if (!message.trim() || !hasConfiguredGenerationProvider) return;

      const params = new URLSearchParams({ firstMessage: message });
      if (selectedProvider) params.set('provider', selectedProvider);
      if (selectedModel) params.set('model', selectedModel);
      if (projectIdParam) params.set('projectId', projectIdParam);
      router.push(`/chat/new?${params.toString()}`);
    },
    [router, hasConfiguredGenerationProvider, selectedModel, selectedProvider, projectIdParam]
  );

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="w-full max-w-2xl px-4 py-8">
        <div className="mb-7 text-center">
          <h1 className="text-2xl font-bold tracking-[0] text-[var(--text-primary)]">
            What should T3X make sense of?
          </h1>
          <p className="mx-auto mt-2 max-w-[520px] text-sm leading-normal text-[var(--text-secondary)]">
            Start with rough context. T3X keeps the source, extracts meaning, and turns useful work
            into commits.
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)]">
            {FLOW_STEPS.map((step, index) => (
              <div key={step} className="contents">
                {index > 0 && (
                  <span aria-hidden="true" className="text-[var(--text-tertiary)]/60">
                    -&gt;
                  </span>
                )}
                <span className="inline-flex h-6 items-center rounded-full border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-2.5">
                  {step}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STARTER_CARDS.map((card) => (
            <button
              key={card.title}
              type="button"
              disabled={!hasConfiguredGenerationProvider}
              onClick={() => handleSend(card.prompt)}
              className="flex min-h-[106px] flex-col items-start gap-2.5 rounded-xl border border-[var(--stroke-default)] bg-[var(--surface-panel)] px-4 py-3.5 text-left transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--surface-panel)] hover:shadow-[var(--fx-shadow-sm)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${ICON_TONE_CLASSES[card.tone]}`}
              >
                <card.icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{card.title}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{card.description}</div>
              </div>
            </button>
          ))}
        </div>

        {!loading && !hasConfiguredGenerationProvider && (
          <div className="mb-4">
            <ProviderSetupBanner
              variant={availabilityError === 'api_unavailable' ? 'api-unavailable' : 'setup'}
            />
          </div>
        )}

        <ChatInput
          onSend={handleSend}
          placeholder="Paste notes, ask a question, or describe what to preserve..."
          draftKey={projectIdParam ? `landing:${projectIdParam}` : 'landing'}
          selectedProvider={selectedProvider ?? ''}
          selectedModel={selectedModel ?? ''}
          disabled={!hasConfiguredGenerationProvider || loading}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
  );
}
