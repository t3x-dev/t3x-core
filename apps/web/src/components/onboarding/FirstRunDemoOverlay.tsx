'use client';

import { DEMO_WORKSPACE_FIXTURE } from '@t3x-dev/core';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitCommit,
  Keyboard,
  Layers3,
  ListChecks,
  MessageSquareText,
  Play,
  SendHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

type DemoStepId =
  | 'welcome'
  | 'starter_cards'
  | 'flow'
  | 'provider'
  | 'composer'
  | 'send'
  | 'review'
  | 'finish';

type DemoTone = 'conversation' | 'source' | 'extract' | 'pending' | 'commit' | 'leaf' | 'success';

interface DemoStep {
  id: DemoStepId;
  label: string;
  title: string;
  description: string;
  target: string | null;
  tone: DemoTone;
  icon: typeof Play;
  details: string[];
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 'welcome',
    label: 'Start',
    title: 'Start from real material, not a blank chat',
    description:
      'This page is where a user gives T3X a prompt, transcript, release note, design discussion, or policy text to make sense of.',
    target: 'landing-copy',
    tone: 'conversation',
    icon: Play,
    details: [
      'The heading states the first user job: choose what T3X should make sense of.',
      'The flow chips below summarize the mental model: source becomes meaning, meaning becomes commit.',
      'In this demo, no external model API is required; the walkthrough uses developer-seeded example data.',
    ],
  },
  {
    id: 'starter_cards',
    label: 'Shortcuts',
    title: 'Use starter cards to choose a common workflow',
    description:
      'These cards are not decoration. They prefill the composer with a task pattern so a new user does not need to invent the first instruction.',
    target: 'starter-cards',
    tone: 'source',
    icon: FileText,
    details: [
      'Compare prompt versions: use this when the user has V1/V2 text and wants semantic changes preserved.',
      'Extract decisions from notes: use this for meetings, research, and design discussions.',
      'Create reusable output: use this when committed meaning should become a leaf artifact.',
    ],
  },
  {
    id: 'flow',
    label: 'Flow',
    title: 'Explain the product path before the user clicks',
    description:
      'The small Source -> Meaning -> Commit path is the simplest explanation of what will happen after the user starts.',
    target: 'flow-steps',
    tone: 'extract',
    icon: Layers3,
    details: [
      'Source is the original evidence.',
      'Meaning is the extracted, reviewable structure.',
      'Commit is the stable semantic version users can diff, merge, and reuse.',
    ],
  },
  {
    id: 'provider',
    label: 'Provider',
    title: 'Provider setup is optional for this demo path',
    description:
      'In normal use, generation needs a configured provider. The first-run demo should still teach the interface even when the user has no API key.',
    target: 'provider-status',
    tone: 'pending',
    icon: ListChecks,
    details: [
      'If the provider banner is visible, it explains why live generation is disabled.',
      'The onboarding path itself uses prepared data, so the user can learn before connecting a provider.',
      'When a provider is configured, this step becomes a quick model/status explanation.',
    ],
  },
  {
    id: 'composer',
    label: 'Composer',
    title: 'The composer is where the source and instruction enter',
    description:
      'This is the main action area. Users paste raw material, select a model when available, attach context, then start the workflow.',
    target: 'composer',
    tone: 'conversation',
    icon: MessageSquareText,
    details: [
      `Example source: ${DEMO_WORKSPACE_FIXTURE.source.title}.`,
      'The text box receives the material and instruction.',
      'The surrounding controls handle model selection and attachments when the provider path is enabled.',
    ],
  },
  {
    id: 'send',
    label: 'Start',
    title: 'Starting a run creates the next work surface',
    description:
      'After the user sends material, T3X moves from lightweight input into the working area where extracted points can be reviewed.',
    target: 'composer',
    tone: 'pending',
    icon: SendHorizontal,
    details: [
      'For live use, the send action creates or opens a conversation workspace.',
      'For the guided demo, the same story is played with seeded source, draft points, constraints, and output.',
      'The important habit is: start broad, then review before committing.',
    ],
  },
  {
    id: 'review',
    label: 'Review',
    title: 'What the next screen teaches after starting',
    description:
      'The rest of the demo should continue as a guided review: inspect extracted points, adjust constraints, preview output, then commit.',
    target: null,
    tone: 'commit',
    icon: GitCommit,
    details: [
      'Draft points: include or exclude the meaning that should survive.',
      'Constraints: require key facts and exclude unsafe phrasing.',
      'Commit: save the reviewed meaning as a stable version before reusing it.',
    ],
  },
  {
    id: 'finish',
    label: 'Use',
    title: 'You can now use the page intentionally',
    description:
      'The first-run teaching path ends here and leaves the user on the real /chat page, ready to try the same actions.',
    target: null,
    tone: 'success',
    icon: CheckCircle2,
    details: [
      'No separate demo page is needed.',
      'The user learned what to paste, which shortcut to choose, what provider state means, and what happens after sending.',
      'The dev-only replay remains available at /chat?introDemo=1 while building this walkthrough.',
    ],
  },
];

const TONE_CLASSES: Record<DemoTone, string> = {
  conversation:
    'border-[var(--accent-conversation)]/25 bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)]',
  source: 'border-[var(--source)]/25 bg-[var(--source-dim)] text-[var(--source)]',
  extract: 'border-[var(--accent-extract)]/25 bg-[var(--source-dim)] text-[var(--accent-extract)]',
  pending:
    'border-[var(--accent-pending)]/25 bg-[var(--accent-pending-soft)] text-[var(--accent-pending)]',
  commit:
    'border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]',
  leaf: 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]',
  success:
    'border-[var(--status-success)]/25 bg-[var(--status-success-muted)] text-[var(--status-success)]',
};

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readTargetRect(target: string | null): TargetRect | null {
  if (!target) return null;
  const node = document.querySelector<HTMLElement>(`[data-intro-target="${target}"]`);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface FirstRunDemoOverlayProps {
  open: boolean;
  onClose: () => void;
  onOpenDemoProject?: () => void;
  openingDemoProject?: boolean;
  openDemoProjectError?: string | null;
}

export function FirstRunDemoOverlay({
  open,
  onClose,
  onOpenDemoProject,
  openingDemoProject = false,
  openDemoProjectError = null,
}: FirstRunDemoOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const coachRef = useRef<HTMLDivElement>(null);
  const [coachHeight, setCoachHeight] = useState(360);
  const step = DEMO_STEPS[stepIndex] ?? DEMO_STEPS[0];
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === DEMO_STEPS.length - 1;
  const StepIcon = step.icon;

  const coachPosition = useMemo(() => {
    const width =
      typeof window === 'undefined' ? 420 : Math.max(240, Math.min(420, window.innerWidth - 32));
    const height =
      typeof window === 'undefined' ? coachHeight : Math.min(coachHeight, window.innerHeight - 32);
    const maxTop =
      typeof window === 'undefined' ? 16 : Math.max(16, window.innerHeight - height - 16);
    if (!targetRect) {
      return {
        width,
        top:
          typeof window === 'undefined'
            ? 120
            : clamp(window.innerHeight / 2 - height / 2, 16, maxTop),
        left: typeof window === 'undefined' ? 16 : Math.max(16, window.innerWidth / 2 - width / 2),
      };
    }

    const gap = 16;
    const rightCandidate = targetRect.left + targetRect.width + gap;
    const leftCandidate = targetRect.left - width - gap;
    const left =
      rightCandidate + width <= window.innerWidth - 16
        ? rightCandidate
        : leftCandidate >= 16
          ? leftCandidate
          : clamp(targetRect.left, 16, window.innerWidth - width - 16);
    const top = clamp(targetRect.top, 16, maxTop);
    return { width, top, left };
  }, [coachHeight, targetRect]);

  useEffect(() => {
    if (!open || !coachRef.current) return;
    const measure = () => {
      if (!coachRef.current) return;
      const rect = coachRef.current.getBoundingClientRect();
      setCoachHeight(rect.height);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(coachRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, stepIndex, openDemoProjectError]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setTargetRect(null);
      return;
    }

    const update = () => setTargetRect(readTargetRect(step.target));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step.target]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || prefersReducedMotion() || atEnd) return;
    const timeout = window.setTimeout(
      () => setStepIndex((current) => Math.min(current + 1, DEMO_STEPS.length - 1)),
      step.id === 'welcome' ? 3200 : 4200
    );
    return () => window.clearTimeout(timeout);
  }, [atEnd, open, step.id]);

  if (!open) return null;

  const finishDemo = () => {
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[90] bg-[var(--overlay-scrim)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-demo-title"
    >
      {targetRect ? (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-[var(--accent-conversation)] bg-transparent shadow-[0_0_0_9999px_var(--overlay-scrim),0_0_0_6px_var(--accent-conversation-soft)] transition-all duration-200"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
          aria-hidden="true"
        />
      ) : null}

      <div
        ref={coachRef}
        className="absolute max-h-[calc(100vh-32px)] overflow-auto rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] shadow-[var(--fx-shadow-lg)]"
        style={{
          top: coachPosition.top,
          left: coachPosition.left,
          width: coachPosition.width,
          maxHeight: 'calc(100vh - 32px)',
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
          <div className="min-w-0">
            <div
              className={cn(
                'mb-2 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium',
                TONE_CLASSES[step.tone]
              )}
            >
              <StepIcon className="h-3.5 w-3.5" />
              Guided walkthrough · no API needed
            </div>
            <h2
              id="first-run-demo-title"
              className="text-base font-semibold tracking-[0] text-[var(--text-primary)]"
            >
              {step.title}
            </h2>
            <p className="mt-1 text-sm leading-normal text-[var(--text-secondary)]">
              {step.description}
            </p>
          </div>
          <button
            type="button"
            aria-label="Skip intro demo"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-4 gap-1.5">
            {DEMO_STEPS.map((item, index) => {
              const selected = index === stepIndex;
              const completed = index < stepIndex;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-md border text-xs transition-colors',
                    selected
                      ? cn('border-current', TONE_CLASSES[item.tone])
                      : completed
                        ? TONE_CLASSES.success
                        : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                  )}
                  aria-current={selected ? 'step' : undefined}
                  aria-label={item.label}
                >
                  {completed ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-[var(--stroke-divider)] bg-[var(--surface-card)] p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0] text-[var(--text-tertiary)]">
              <Keyboard className="h-3.5 w-3.5" />
              What to learn here
            </div>
            <ul className="space-y-2">
              {step.details.map((detail) => (
                <li
                  key={detail}
                  className="flex gap-2 text-sm leading-normal text-[var(--text-secondary)]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-50" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {step.id === 'composer' || step.id === 'send' ? (
            <div className="rounded-lg border border-[var(--accent-pending)]/25 bg-[var(--accent-pending-soft)] p-3 text-sm leading-normal text-[var(--text-secondary)]">
              Demo source preview: {DEMO_WORKSPACE_FIXTURE.source.text}
            </div>
          ) : null}
          {openDemoProjectError ? (
            <div className="rounded-lg border border-[var(--status-error)]/25 bg-[var(--status-error-muted)] p-3 text-sm text-[var(--status-error)]">
              {openDemoProjectError}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span className="font-mono">
              {String(stepIndex + 1).padStart(2, '0')} /{' '}
              {String(DEMO_STEPS.length).padStart(2, '0')}
            </span>
            <span>{step.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="canvas-outline"
              size="sm"
              disabled={atStart}
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              type="button"
              variant="canvas-outline"
              size="sm"
              onClick={() =>
                setStepIndex((current) =>
                  atEnd ? 0 : Math.min(current + 1, DEMO_STEPS.length - 1)
                )
              }
            >
              {atEnd ? 'Replay' : 'Next'}
              {atEnd ? <Play className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Skip
            </Button>
            {onOpenDemoProject ? (
              <Button
                type="button"
                variant="pending"
                size="sm"
                disabled={openingDemoProject}
                onClick={onOpenDemoProject}
              >
                {openingDemoProject ? 'Opening...' : 'Open demo project'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
            <Button type="button" variant="commit" size="sm" onClick={finishDemo}>
              Start using T3X
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
