'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import { LandingDemoPreview } from '@/components/chat/LandingDemoPreview';
import { ProviderSetupBanner } from '@/components/chat/ProviderSetupBanner';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useChatStore } from '@/store/chatStore';

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
  const [starterDraft, setStarterDraft] = useState<{ text: string; revision: number } | null>(null);
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

  const handleDemoSelect = useCallback((source: string) => {
    setStarterDraft((current) => ({
      text: source,
      revision: (current?.revision ?? 0) + 1,
    }));
  }, []);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-start px-3 py-4 sm:justify-center sm:px-4 sm:py-6">
        <div className="mb-3 text-center sm:mb-5">
          <h1 className="text-2xl font-bold tracking-[0] text-[var(--text-primary)]">
            What should T3X make sense of?
          </h1>
          <p className="mx-auto mt-2 max-w-[520px] text-sm leading-normal text-[var(--text-secondary)]">
            Paste a prompt, chat transcript, release note, or design discussion. T3X keeps the
            source, extracts meaning, and turns useful work into commits.
          </p>
        </div>

        <div className="mb-3 sm:mb-4">
          <LandingDemoPreview onSelectSource={handleDemoSelect} />
        </div>

        {!loading && !hasConfiguredGenerationProvider && (
          <div className="mx-auto mb-4 max-w-2xl">
            <ProviderSetupBanner
              variant={availabilityError === 'api_unavailable' ? 'api-unavailable' : 'setup'}
            />
          </div>
        )}

        <div className="mx-auto w-full max-w-2xl">
          <ChatInput
            onSend={handleSend}
            placeholder="Paste a prompt, transcript, release note, or design discussion..."
            draftKey={projectIdParam ? `landing:${projectIdParam}` : 'landing'}
            selectedProvider={selectedProvider ?? ''}
            selectedModel={selectedModel ?? ''}
            disabled={!hasConfiguredGenerationProvider || loading}
            onModelChange={handleModelChange}
            prefillText={starterDraft?.text ?? null}
            prefillRevision={starterDraft?.revision}
          />
        </div>
      </div>
    </div>
  );
}
