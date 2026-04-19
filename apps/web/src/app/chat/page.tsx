'use client';

import { ClipboardList, Lightbulb, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import { ProviderSetupBanner } from '@/components/chat/ProviderSetupBanner';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';

const STARTER_CARDS = [
  {
    icon: ClipboardList,
    title: 'Capture meeting notes',
    description: 'Summarize key decisions',
    prompt: 'I just had a meeting about... Here are my notes:',
  },
  {
    icon: Target,
    title: 'Analyze product strategy',
    description: 'Break down your thinking',
    prompt: 'I want to analyze our approach to...',
  },
  {
    icon: Lightbulb,
    title: 'Explore a new idea',
    description: 'Think through possibilities',
    prompt: "I'm exploring an idea about...",
  },
] as const;

export default function ChatLandingPage() {
  const router = useRouter();
  const {
    loading,
    hasConfiguredGenerationProvider,
    selectedProvider,
    selectedModel,
    handleModelChange,
  } = useChatModelSelection({});

  const handleSend = useCallback(
    (message: string) => {
      if (!message.trim() || !hasConfiguredGenerationProvider) return;

      const params = new URLSearchParams({ firstMessage: message });
      if (selectedProvider) params.set('provider', selectedProvider);
      if (selectedModel) params.set('model', selectedModel);
      router.push(`/chat/new?${params.toString()}`);
    },
    [router, hasConfiguredGenerationProvider, selectedModel, selectedProvider]
  );

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="max-w-2xl w-full px-4">
        <h1 className="text-2xl font-bold text-center mb-2">T3X</h1>
        <p className="text-muted-foreground text-center mb-8 text-sm">Git for Meaning</p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          {STARTER_CARDS.map((card) => (
            <button
              key={card.title}
              type="button"
              disabled={!hasConfiguredGenerationProvider}
              onClick={() => handleSend(card.prompt)}
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--stroke-default)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--hover-bg)] hover:border-[var(--accent-commit)]/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <card.icon className="h-4 w-4 text-[var(--text-tertiary)]" />
              <div>
                <div className="text-sm font-medium">{card.title}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{card.description}</div>
              </div>
            </button>
          ))}
        </div>

        {!loading && !hasConfiguredGenerationProvider && (
          <div className="mb-4">
            <ProviderSetupBanner />
          </div>
        )}

        <ChatInput
          onSend={handleSend}
          placeholder="Start a conversation..."
          selectedModel={selectedModel ?? ''}
          disabled={!hasConfiguredGenerationProvider || loading}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
  );
}
