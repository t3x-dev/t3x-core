'use client';

import { CheckCircle2, ChevronLeft, ChevronRight, type LucideIcon, Play, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export type FeatureTourTone =
  | 'conversation'
  | 'source'
  | 'extract'
  | 'pending'
  | 'commit'
  | 'leaf'
  | 'success';

export interface FeatureTourStep {
  id: string;
  label: string;
  title: string;
  description: string;
  target: string | null;
  positionTarget?: string | null;
  placement?: 'above' | 'side-center';
  tone: FeatureTourTone;
  icon: LucideIcon;
  advanceOnTargetClick?: boolean;
  advanceDelayMs?: number;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TONE_CLASSES: Record<FeatureTourTone, string> = {
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

function readTargetRect(target: string | null): TargetRect | null {
  if (!target) return null;
  const node = findIntroTarget(target);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

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

function rectsEqual(current: TargetRect | null, next: TargetRect | null) {
  if (current === next) return true;
  if (!current || !next) return false;
  return (
    Math.abs(current.top - next.top) < 0.5 &&
    Math.abs(current.left - next.left) < 0.5 &&
    Math.abs(current.width - next.width) < 0.5 &&
    Math.abs(current.height - next.height) < 0.5
  );
}

function stopInteraction(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  if ('stopImmediatePropagation' in event) {
    event.stopImmediatePropagation();
  }
}

interface FeatureTourOverlayProps {
  open: boolean;
  title: string;
  steps: FeatureTourStep[];
  onClose: () => void;
  onDone?: () => void;
  onSkip?: () => void;
  doneLabel?: string;
  interactionMode?: 'coach' | 'guided';
}

export function FeatureTourOverlay({
  open,
  title,
  steps,
  onClose,
  onDone,
  onSkip,
  doneLabel = 'Done',
  interactionMode = 'coach',
}: FeatureTourOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [positionRect, setPositionRect] = useState<TargetRect | null>(null);
  const [advancingAfterTargetClick, setAdvancingAfterTargetClick] = useState(false);
  const coachRef = useRef<HTMLDivElement>(null);
  const [coachHeight, setCoachHeight] = useState(360);
  const step = steps[stepIndex] ?? steps[0];
  const atStart = stepIndex === 0;
  const atEnd = stepIndex === steps.length - 1;
  const StepIcon = step?.icon ?? Play;
  const guided = interactionMode === 'guided';
  const showStepNav = !guided;
  const waitingForTargetClick = guided && step?.advanceOnTargetClick;
  const actionLabel = guided ? 'Done' : doneLabel;

  const coachPosition = useMemo(() => {
    const width =
      typeof window === 'undefined' ? 420 : Math.max(240, Math.min(420, window.innerWidth - 32));
    const height =
      typeof window === 'undefined' ? coachHeight : Math.min(coachHeight, window.innerHeight - 32);
    const maxTop =
      typeof window === 'undefined' ? 16 : Math.max(16, window.innerHeight - height - 16);
    const anchorRect = positionRect ?? targetRect;
    if (!anchorRect) {
      return {
        width,
        top:
          typeof window === 'undefined'
            ? 120
            : clamp(window.innerHeight / 2 - height / 2, 16, maxTop),
        left: typeof window === 'undefined' ? 16 : Math.max(16, window.innerWidth / 2 - width / 2),
        maxHeight: undefined,
      };
    }

    const gap = 16;
    if (step?.placement === 'above') {
      const tightGap = 8;
      const top = Math.max(16, anchorRect.top - height - tightGap);
      const availableHeight = Math.max(160, anchorRect.top - tightGap - top);
      return {
        width,
        top,
        left: clamp(
          anchorRect.left + anchorRect.width / 2 - width / 2,
          16,
          window.innerWidth - width - 16
        ),
        maxHeight: availableHeight,
      };
    }

    const rightCandidate = anchorRect.left + anchorRect.width + gap;
    const leftCandidate = anchorRect.left - width - gap;
    const left =
      rightCandidate + width <= window.innerWidth - 16
        ? rightCandidate
        : leftCandidate >= 16
          ? leftCandidate
          : clamp(anchorRect.left, 16, window.innerWidth - width - 16);
    const top =
      step?.placement === 'side-center'
        ? clamp(anchorRect.top + anchorRect.height / 2 - height / 2, 16, maxTop)
        : clamp(anchorRect.top, 16, maxTop);
    return { width, top, left, maxHeight: undefined };
  }, [coachHeight, positionRect, step?.placement, targetRect]);

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
    if (!open || !step) {
      setStepIndex(0);
      setTargetRect(null);
      setPositionRect(null);
      setAdvancingAfterTargetClick(false);
      return;
    }

    let animationFrame = 0;
    let settleFrames = 0;

    const measure = () => {
      const nextTargetRect = readTargetRect(step.target);
      const nextPositionRect = step.positionTarget
        ? readTargetRect(step.positionTarget)
        : nextTargetRect;
      setTargetRect((current) => (rectsEqual(current, nextTargetRect) ? current : nextTargetRect));
      setPositionRect((current) =>
        rectsEqual(current, nextPositionRect) ? current : nextPositionRect
      );
    };

    const update = (framesToSettle = 0) => {
      settleFrames = Math.max(settleFrames, framesToSettle);
      cancelAnimationFrame(animationFrame);
      const tick = () => {
        measure();
        if (settleFrames <= 0) return;
        settleFrames -= 1;
        animationFrame = requestAnimationFrame(tick);
      };
      animationFrame = requestAnimationFrame(tick);
    };
    const updateOnce = () => update();
    const updateWhileSettling = () => update(18);

    updateWhileSettling();
    window.addEventListener('resize', updateOnce);
    window.addEventListener('scroll', updateOnce, true);
    const observer = new MutationObserver(updateWhileSettling);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener('resize', updateOnce);
      window.removeEventListener('scroll', updateOnce, true);
    };
  }, [open, step?.positionTarget, step?.target]);

  useEffect(() => {
    if (!open || !step?.advanceOnTargetClick || !step.target) return;
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
        const nextStep = steps[stepIndex + 1];
        await waitForReadyTarget(nextStep?.target ?? null);
        setStepIndex((current) => Math.min(current + 1, steps.length - 1));
        setAdvancingAfterTargetClick(false);
      }, step.advanceDelayMs ?? 0);
    };
    document.addEventListener('click', handleTargetClick, true);
    return () => document.removeEventListener('click', handleTargetClick, true);
  }, [advancingAfterTargetClick, atEnd, onDone, open, step, stepIndex, steps]);

  useEffect(() => {
    if (!open || interactionMode !== 'guided') return;

    const allowOnlyCoachOrTarget = (event: Event) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Node)) return;
      if (coachRef.current?.contains(eventTarget)) return;

      const targetNode = findIntroTarget(step?.target ?? null);
      if (targetNode?.contains(eventTarget)) return;

      stopInteraction(event);
    };

    document.addEventListener('pointerdown', allowOnlyCoachOrTarget, true);
    document.addEventListener('mousedown', allowOnlyCoachOrTarget, true);
    document.addEventListener('click', allowOnlyCoachOrTarget, true);
    return () => {
      document.removeEventListener('pointerdown', allowOnlyCoachOrTarget, true);
      document.removeEventListener('mousedown', allowOnlyCoachOrTarget, true);
      document.removeEventListener('click', allowOnlyCoachOrTarget, true);
    };
  }, [interactionMode, open, step?.target]);

  if (!open || !step) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[90] bg-[var(--overlay-scrim)]',
        guided && 'pointer-events-none'
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feature-tour-title"
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
          maxHeight: coachPosition.maxHeight ?? 'calc(100vh - 32px)',
        }}
      >
        <header
          className={cn(
            'flex items-start justify-between gap-3 px-4 py-3',
            showStepNav && 'border-b border-[var(--stroke-divider)]'
          )}
        >
          <div>
            <div
              className={cn(
                'mb-2 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium',
                TONE_CLASSES[step.tone]
              )}
            >
              <StepIcon className="h-3.5 w-3.5" />
              {title}
            </div>
            <h2
              id="feature-tour-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              {step.title}
            </h2>
            <p className="mt-1 text-sm leading-normal text-[var(--text-secondary)]">
              {step.description}
            </p>
          </div>
          {!guided && (
            <button
              type="button"
              aria-label={`Close ${title}`}
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        {showStepNav ? (
          <div className="space-y-3 px-4 py-3">
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
            >
              {steps.map((item, index) => {
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
          </div>
        ) : null}

        <footer
          className={cn(
            'flex flex-col border-t border-[var(--stroke-divider)] bg-[var(--surface-card)] px-4 sm:flex-row sm:items-center sm:justify-between',
            guided ? 'gap-1.5 py-2' : 'gap-2 py-3'
          )}
        >
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span className="font-mono">
              {String(stepIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
            </span>
            <span>{step.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!guided && (
              <>
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
                    setStepIndex((current) => (atEnd ? 0 : Math.min(current + 1, steps.length - 1)))
                  }
                >
                  {advancingAfterTargetClick
                    ? 'Waiting for result...'
                    : waitingForTargetClick
                      ? 'Click highlighted item'
                      : atEnd
                        ? 'Replay'
                        : 'Next'}
                  {atEnd ? <Play className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onSkip ?? onDone ?? onClose}>
              {actionLabel}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
