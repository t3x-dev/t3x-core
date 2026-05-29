'use client';

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  GitCommit,
  Leaf,
  Map as MapIcon,
  MousePointerClick,
  Play,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

type ProjectTourStepId = 'modes' | 'canvas' | 'actions' | 'zoom' | 'stats' | 'finish';

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ProjectTourStep {
  id: ProjectTourStepId;
  label: string;
  title: string;
  description: string;
  target: string | null;
  icon: typeof Play;
  tone: 'conversation' | 'commit' | 'leaf' | 'success';
  details: string[];
  advanceOnTargetClick?: boolean;
}

const PROJECT_TOUR_STEPS: ProjectTourStep[] = [
  {
    id: 'modes',
    label: 'Modes',
    title: 'Canvas is part of the same project workflow',
    description:
      'The sidebar keeps Chat, Canvas, and Leaf connected so users can move through the product without losing project context.',
    target: 'shell-mode-tabs',
    icon: MousePointerClick,
    tone: 'conversation',
    details: [
      'Chat captures the request and source material.',
      'Canvas turns committed meaning into a visible version path.',
      'Leaf collects reusable output artifacts.',
    ],
  },
  {
    id: 'canvas',
    label: 'Select',
    title: 'Click a commit node to reveal Canvas actions',
    description:
      'This step advances only after the user clicks a real committed node on the graph.',
    target: 'canvas-commit-node',
    icon: MapIcon,
    tone: 'conversation',
    details: [
      'Each committed node represents reviewed meaning.',
      'Edges show how the project evolved.',
      'Single-click a commit to open its action controls.',
    ],
    advanceOnTargetClick: true,
  },
  {
    id: 'actions',
    label: 'Actions',
    title: 'The action bar appears because of that click',
    description:
      'Users learn the core Canvas pattern here: select a version first, then choose details, diff, leaf, or new leaf actions.',
    target: 'canvas-floating-action-open-leaf',
    icon: GitCommit,
    tone: 'commit',
    details: [
      'Details opens the reviewed commit.',
      'Open Leaf jumps to artifacts generated from this version.',
      'New Leaf creates another reusable output from the selected commit.',
    ],
  },
  {
    id: 'zoom',
    label: 'Zoom',
    title: 'Click a zoom control to move the canvas',
    description:
      'The bottom controls are real graph navigation controls. The demo advances after the user clicks inside this control group.',
    target: 'canvas-viewport-controls',
    icon: MapIcon,
    tone: 'conversation',
    details: [
      'Minus and plus change graph scale.',
      'The percentage resets to a readable zoom level.',
      'Fit view brings scattered nodes back into frame.',
    ],
    advanceOnTargetClick: true,
  },
  {
    id: 'stats',
    label: 'Stats',
    title: 'Use the toolbar to orient the user',
    description:
      'The toolbar summarizes how many commits, branches, and leaves exist after the Chat commit is complete.',
    target: 'project-toolbar',
    icon: FileSearch,
    tone: 'commit',
    details: [
      'Main commits are stable semantic versions.',
      'Leaf count tells the user whether reusable output already exists.',
      'The latest hash anchors this project in an auditable version path.',
    ],
  },
  {
    id: 'finish',
    label: 'Leaf',
    title: 'Click the real Leaf tab to continue',
    description:
      'The Canvas section ends by using the same sidebar navigation users will use later.',
    target: 'sidebar-leaf-tab',
    icon: Leaf,
    tone: 'success',
    details: [
      'Click Leaf in the sidebar mode switcher.',
      'The route changes to the project Leaf index.',
      'The next step opens a real artifact card.',
    ],
    advanceOnTargetClick: true,
  },
];

const TONE_CLASSES: Record<ProjectTourStep['tone'], string> = {
  conversation:
    'border-[var(--accent-conversation)]/25 bg-[var(--accent-conversation-soft)] text-[var(--accent-conversation)]',
  commit:
    'border-[var(--accent-commit)]/25 bg-[var(--accent-commit-soft)] text-[var(--accent-commit)]',
  leaf: 'border-[var(--accent-leaf)]/25 bg-[var(--accent-leaf-soft)] text-[var(--accent-leaf)]',
  success:
    'border-[var(--status-success)]/25 bg-[var(--status-success-muted)] text-[var(--status-success)]',
};

function findIntroTarget(target: string | null): HTMLElement | null {
  if (!target) return null;
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-intro-target="${target}"]`)
  );
  return (
    nodes.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) ??
    nodes[0] ??
    null
  );
}

function readTargetRect(target: string | null): TargetRect | null {
  const node = findIntroTarget(target);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function isTargetReady(target: string | null): boolean {
  const node = findIntroTarget(target);
  if (!node) return false;
  if (node instanceof HTMLButtonElement && node.disabled) return false;
  if (node.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

function waitForReadyTarget(target: string | null, timeoutMs = 3000): Promise<void> {
  if (!target || isTargetReady(target)) return Promise.resolve();

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let animationFrame = 0;
    let timeout = 0;
    let observer: MutationObserver | null = null;

    const cleanup = () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      observer?.disconnect();
    };

    const check = () => {
      if (isTargetReady(target) || Date.now() - startedAt >= timeoutMs) {
        cleanup();
        resolve();
        return;
      }
      animationFrame = requestAnimationFrame(check);
    };

    observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    timeout = window.setTimeout(check, timeoutMs);
    check();
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

interface ProjectDemoTourOverlayProps {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  doneLabel?: string;
  interactionMode?: 'coach' | 'guided';
}

export function ProjectDemoTourOverlay({
  open,
  onClose,
  onDone,
  doneLabel = 'Done',
  interactionMode = 'coach',
}: ProjectDemoTourOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [advancingAfterTargetClick, setAdvancingAfterTargetClick] = useState(false);
  const coachRef = useRef<HTMLDivElement>(null);
  const [coachHeight, setCoachHeight] = useState(360);
  const step = PROJECT_TOUR_STEPS[stepIndex] ?? PROJECT_TOUR_STEPS[0];
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === PROJECT_TOUR_STEPS.length - 1;
  const StepIcon = step.icon;
  const waitingForTargetClick = interactionMode === 'guided' && step.advanceOnTargetClick;

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
      setCoachHeight(coachRef.current.getBoundingClientRect().height);
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
  }, [open, stepIndex]);

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setTargetRect(null);
      setAdvancingAfterTargetClick(false);
      return;
    }

    let animationFrame = 0;
    const update = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        setTargetRect(readTargetRect(step.target));
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, step.target]);

  useEffect(() => {
    if (!open || !step.advanceOnTargetClick || !step.target) return;
    const handleTargetClick = (event: MouseEvent) => {
      if (advancingAfterTargetClick) return;
      const node = findIntroTarget(step.target);
      if (!node || !node.contains(event.target as Node)) return;
      setAdvancingAfterTargetClick(true);
      window.setTimeout(async () => {
        if (atEnd) {
          setAdvancingAfterTargetClick(false);
          onDone?.();
          return;
        }
        const nextStep = PROJECT_TOUR_STEPS[stepIndex + 1];
        await waitForReadyTarget(nextStep?.target ?? null);
        setStepIndex((current) => Math.min(current + 1, PROJECT_TOUR_STEPS.length - 1));
        setAdvancingAfterTargetClick(false);
      }, 0);
    };
    document.addEventListener('click', handleTargetClick, true);
    return () => document.removeEventListener('click', handleTargetClick, true);
  }, [advancingAfterTargetClick, atEnd, onDone, open, step, stepIndex]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[90] bg-[var(--overlay-scrim)]',
        interactionMode === 'guided' && 'pointer-events-none'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-demo-tour-title"
    >
      {targetRect ? (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-[var(--accent-commit)] bg-transparent shadow-[0_0_0_9999px_var(--overlay-scrim),0_0_0_6px_var(--accent-commit-soft)] transition-all duration-200"
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
        className="pointer-events-auto absolute max-h-[calc(100vh-32px)] overflow-auto rounded-lg border border-[var(--stroke-default)] bg-[var(--surface-panel)] shadow-[var(--fx-shadow-lg)]"
        style={{
          top: coachPosition.top,
          left: coachPosition.left,
          width: coachPosition.width,
          maxHeight: 'calc(100vh - 32px)',
        }}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--stroke-divider)] px-4 py-3">
          <div>
            <div
              className={cn(
                'mb-2 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium',
                TONE_CLASSES[step.tone]
              )}
            >
              <StepIcon className="h-3.5 w-3.5" />
              Project walkthrough
            </div>
            <h2
              id="project-demo-tour-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              {step.title}
            </h2>
            <p className="mt-1 text-sm leading-normal text-[var(--text-secondary)]">
              {step.description}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close project walkthrough"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(36px,1fr))] gap-1.5">
            {PROJECT_TOUR_STEPS.map((item, index) => {
              const selected = index === stepIndex;
              const completed = index < stepIndex;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  aria-current={selected ? 'step' : undefined}
                  aria-label={item.label}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-md border text-xs transition-colors',
                    selected
                      ? cn('border-current', TONE_CLASSES[item.tone])
                      : completed
                        ? TONE_CLASSES.success
                        : 'border-[var(--stroke-divider)] bg-[var(--surface-card)] text-[var(--text-tertiary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]'
                  )}
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
              <MousePointerClick className="h-3.5 w-3.5" />
              What to click here
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
        </div>

        <footer className="flex flex-col gap-2 border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span className="font-mono">
              {String(stepIndex + 1).padStart(2, '0')} /{' '}
              {String(PROJECT_TOUR_STEPS.length).padStart(2, '0')}
            </span>
            <span>{step.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="canvas-outline"
              size="sm"
              disabled={atStart}
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              variant="canvas-outline"
              size="sm"
              disabled={Boolean(waitingForTargetClick)}
              onClick={() =>
                setStepIndex((current) =>
                  atEnd ? 0 : Math.min(current + 1, PROJECT_TOUR_STEPS.length - 1)
                )
              }
            >
              {waitingForTargetClick ? 'Click highlighted control' : atEnd ? 'Replay' : 'Next'}
              {atEnd ? <Play className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDone ?? onClose}>
              {doneLabel}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
