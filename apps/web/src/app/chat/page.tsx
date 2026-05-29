'use client';

import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import {
  ArrowRight,
  FileText,
  FolderPlus,
  Keyboard,
  Leaf as LeafIcon,
  SendHorizontal,
  Sparkles,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ChatInput } from '@/components/chat/ChatInput';
import { ProviderSetupBanner } from '@/components/chat/ProviderSetupBanner';
import {
  FeatureTourOverlay,
  type FeatureTourStep,
} from '@/components/onboarding/FeatureTourOverlay';
import { useFirstRunDemo } from '@/hooks/onboarding/useFirstRunDemo';
import { useChatModelSelection } from '@/hooks/shared/useChatModelSelection';
import { useChatStore } from '@/store/chatStore';

const STARTER_CARDS = [
  {
    icon: FileText,
    title: 'Compare prompt versions',
    description: 'Paste variants and preserve what changed.',
    prompt: 'Compare these prompt versions and extract the meaningful changes:\n\n',
    tone: 'source',
  },
  {
    icon: Sparkles,
    title: 'Extract decisions from notes',
    description: 'Find decisions, facts, risks, and tensions.',
    prompt: 'Extract the decisions, facts, risks, and tensions from these notes:\n\n',
    tone: 'meaning',
  },
  {
    icon: LeafIcon,
    title: 'Create reusable output',
    description: 'Turn committed meaning into an artifact.',
    prompt: 'Create a reusable output from this committed knowledge:\n\n',
    tone: 'leaf',
  },
] as const;

const FLOW_STEPS = ['Source', 'Meaning', 'Commit'] as const;

const ICON_TONE_CLASSES = {
  source: 'border-[var(--source)]/20 bg-[var(--source-dim)] text-[var(--source)]',
  meaning: 'border-[var(--accent-extract)]/20 bg-[var(--source-dim)] text-[var(--accent-extract)]',
  leaf: 'border-[var(--accent-leaf)]/20 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]',
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
  const forceIntroDemo =
    process.env.NODE_ENV !== 'production' && searchParams.get('introDemo') === '1';
  const introDemoStage = searchParams.get('introDemoStage') ?? 'create';
  const firstRunDemo = useFirstRunDemo({ forceOpen: forceIntroDemo });
  // Anchor this landing to a specific project when one was passed in the
  // URL (e.g. the "+ New Project" sidebar action lands here so the user can
  // type their first message). Priming the store keeps activeProjectId in
  // sync for the sidebar; propagating the param to /chat/new survives
  // refresh and avoids relying solely on in-memory state.
  const projectIdParam = searchParams.get('projectId');
  const [starterDraft, setStarterDraft] = useState<{ text: string; revision: number } | null>(null);

  const demoTourSteps = useMemo<FeatureTourStep[]>(() => {
    if (introDemoStage === 'compose' && projectIdParam) {
      return [
        {
          id: 'compose',
          label: 'Input',
          title: 'Review the prepared first message',
          description:
            'The demo fills a realistic prompt-review request. The user still starts from the real composer.',
          target: 'composer',
          tone: 'conversation',
          icon: Keyboard,
          details: [
            'This text is developer-seeded demo material.',
            'No model provider is required for the reply.',
            'Click the send button to create the first conversation.',
          ],
        },
        {
          id: 'send',
          label: 'Send',
          title: 'Click Send to produce the preset LLM reply',
          description:
            'The button is real. In the demo path, the response is replayed from fixture data instead of calling an LLM API.',
          target: 'landing-send-action',
          tone: 'conversation',
          icon: SendHorizontal,
          details: [
            'The conversation is created inside the project.',
            'The user message is saved as normal project context.',
            'The assistant reply appears next, then Chat guides Extract and Apply.',
          ],
          advanceOnTargetClick: true,
        },
      ];
    }

    return [
      {
        id: 'create-project',
        label: 'Project',
        title: 'Create the first project',
        description:
          'Start from an empty workspace. A project gives the conversation a place to store meaning, commits, and leaves.',
        target: 'sidebar-new-project',
        tone: 'conversation',
        icon: FolderPlus,
        details: [
          'Click New project in the sidebar.',
          'Projects keep related conversations and semantic versions together.',
          'The demo will continue in the composer after the project is created.',
        ],
        advanceOnTargetClick: true,
      },
      {
        id: 'confirm-project',
        label: 'Create',
        title: 'Name it or keep the default, then create',
        description:
          'The dialog is the normal project creation flow. The demo only preserves the walkthrough state after creation.',
        target: 'new-project-create',
        tone: 'commit',
        icon: ArrowRight,
        details: [
          'You can type a project name, or keep the default.',
          'Click Create to land back on Chat with this project selected.',
          'Next, the composer will receive a prepared prompt-review request.',
        ],
        advanceOnTargetClick: true,
      },
    ];
  }, [introDemoStage, projectIdParam]);

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

  useEffect(() => {
    if (!forceIntroDemo || introDemoStage !== 'compose' || !projectIdParam) return;
    setStarterDraft((current) => {
      if (current?.text === DEMO_WORKSPACE_FIXTURE.source.text) return current;
      return {
        text: DEMO_WORKSPACE_FIXTURE.source.text,
        revision: (current?.revision ?? 0) + 1,
      };
    });
  }, [forceIntroDemo, introDemoStage, projectIdParam]);

  const handleSend = useCallback(
    (message: string) => {
      if (!message.trim()) return;
      if (!forceIntroDemo && !hasConfiguredGenerationProvider) return;

      const params = new URLSearchParams({ firstMessage: message });
      if (forceIntroDemo) {
        params.set('introDemo', '1');
        params.set('fixtureReply', '1');
      } else {
        if (selectedProvider) params.set('provider', selectedProvider);
        if (selectedModel) params.set('model', selectedModel);
      }
      if (projectIdParam) params.set('projectId', projectIdParam);
      router.push(`/chat/new?${params.toString()}`);
    },
    [
      forceIntroDemo,
      router,
      hasConfiguredGenerationProvider,
      selectedModel,
      selectedProvider,
      projectIdParam,
    ]
  );

  return (
    <>
      <div className="flex h-full flex-col items-center justify-center">
        <div className="w-full max-w-2xl px-4 py-8">
          <div className="mb-7 text-center" data-intro-target="landing-copy">
            <h1 className="text-2xl font-bold tracking-[0] text-[var(--text-primary)]">
              What should T3X make sense of?
            </h1>
            <p className="mx-auto mt-2 max-w-[520px] text-sm leading-normal text-[var(--text-secondary)]">
              Paste a prompt, chat transcript, release note, or design discussion. T3X keeps the
              source, extracts meaning, and turns useful work into commits.
            </p>
            <div
              className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--text-tertiary)]"
              data-intro-target="flow-steps"
            >
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

          <div
            className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3"
            data-intro-target="starter-cards"
          >
            {STARTER_CARDS.map((card) => (
              <button
                key={card.title}
                type="button"
                disabled={!hasConfiguredGenerationProvider}
                onClick={() =>
                  setStarterDraft((current) => ({
                    text: card.prompt,
                    revision: (current?.revision ?? 0) + 1,
                  }))
                }
                className="flex min-h-[76px] flex-col items-start gap-2 rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-panel)] px-3 py-2.5 text-left transition-colors hover:border-[var(--stroke-strong)] hover:bg-[var(--hover-bg)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${ICON_TONE_CLASSES[card.tone]}`}
                >
                  <card.icon className="h-3.5 w-3.5" />
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{card.title}</div>
                  <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {card.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {!forceIntroDemo && !loading && !hasConfiguredGenerationProvider && (
            <div className="mb-4" data-intro-target="provider-status">
              <ProviderSetupBanner
                variant={availabilityError === 'api_unavailable' ? 'api-unavailable' : 'setup'}
              />
            </div>
          )}

          <div data-intro-target="composer">
            <ChatInput
              onSend={handleSend}
              placeholder="Paste a prompt, transcript, release note, or design discussion..."
              draftKey={projectIdParam ? `landing:${projectIdParam}` : 'landing'}
              selectedProvider={forceIntroDemo ? 'fixture-replay' : (selectedProvider ?? '')}
              selectedModel={forceIntroDemo ? 'fixture-replay' : (selectedModel ?? '')}
              disabled={forceIntroDemo ? false : !hasConfiguredGenerationProvider || loading}
              onModelChange={handleModelChange}
              prefillText={starterDraft?.text ?? null}
              prefillRevision={starterDraft?.revision}
              sendIntroTarget={forceIntroDemo ? 'landing-send-action' : undefined}
            />
          </div>
        </div>
      </div>
      <FeatureTourOverlay
        open={firstRunDemo.open}
        title="Guided walkthrough"
        steps={demoTourSteps}
        onClose={firstRunDemo.close}
        onDone={firstRunDemo.close}
        doneLabel={forceIntroDemo ? 'Skip' : 'Start using T3X'}
        interactionMode={forceIntroDemo ? 'guided' : 'coach'}
      />
    </>
  );
}
