'use client';

import { ClipboardList, Lightbulb, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import {
  resolveAvailableModelSelection,
  useAvailableModels,
} from '@/hooks/shared/useAvailableModels';

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
  const { providers, loading, defaultProvider, defaultModel } = useAvailableModels();
  const [selectedModel, setSelectedModel] = useState('');
  const handleSend = useCallback(
    (message: string) => {
      if (!message.trim()) return;
      router.push(`/chat/new?firstMessage=${encodeURIComponent(message)}`);
    },
    [router]
  );

  useEffect(() => {
    if (loading) return;
    const resolved = resolveAvailableModelSelection(
      providers,
      null,
      selectedModel,
      defaultProvider,
      defaultModel
    );
    if (resolved.model !== selectedModel) {
      setSelectedModel(resolved.model ?? '');
    }
  }, [loading, providers, defaultProvider, defaultModel, selectedModel]);

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
              onClick={() => handleSend(card.prompt)}
              className="flex flex-col items-start gap-2 rounded-xl border border-[var(--stroke-default)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--hover-bg)] hover:border-[var(--accent-commit)]/40"
            >
              <card.icon className="h-4 w-4 text-[var(--text-tertiary)]" />
              <div>
                <div className="text-sm font-medium">{card.title}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{card.description}</div>
              </div>
            </button>
          ))}
        </div>

        <ChatInput
          onSend={handleSend}
          placeholder="Start a conversation..."
          selectedModel={selectedModel}
          onModelChange={(_provider, model) => setSelectedModel(model)}
        />
      </div>
    </div>
  );
}
