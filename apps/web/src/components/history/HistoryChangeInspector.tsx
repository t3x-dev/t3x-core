'use client';

import { ChevronDown, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { StructuredDiffChange } from '@/domain/diff/structuredStateDiff';
import { cn } from '@/utils/cn';
import styles from './HistoryStructure.module.css';

export interface HistoryChangeCard {
  id: string;
  path: string;
  name: string;
  sourceLabel: string;
  sourceHref: string | null;
  change: Omit<StructuredDiffChange, 'id' | 'path'>;
}

export function HistoryChangeInspector({
  cards,
  selectedId,
  onSelect,
  step,
  playing,
  onStep,
  onPlayingChange,
  changeReason,
  onViewNodeHistory,
}: {
  cards: HistoryChangeCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  step: number | null;
  playing: boolean;
  onStep: (step: number | null) => void;
  onPlayingChange: (playing: boolean) => void;
  changeReason: string;
  onViewNodeHistory?: () => void;
}) {
  const [collapsedId, setCollapsedId] = useState<string | null>(null);
  const [pace, setPace] = useState(3000);
  const list = useRef<HTMLDivElement>(null);
  const count = step ?? cards.length;
  const selectedIndex = cards.findIndex((card) => card.id === selectedId);

  useEffect(() => {
    if (!playing) return;
    if (count >= cards.length) {
      onPlayingChange(false);
      return;
    }
    const timer = window.setTimeout(() => onStep(count + 1), pace);
    return () => window.clearTimeout(timer);
  }, [cards.length, count, onPlayingChange, onStep, pace, playing]);

  useEffect(() => {
    if (selectedId === null) return;
    const target = list.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (!target || !list.current) return;
    const bounds = list.current.getBoundingClientRect();
    const cardBounds = target.getBoundingClientRect();
    if (cardBounds.top < bounds.top || cardBounds.bottom > bounds.bottom) {
      list.current.scrollTo?.({
        top: list.current.scrollTop + cardBounds.top - bounds.top - 12,
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      });
    }
  }, [selectedId, step]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) onPlayingChange(false);
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, [onPlayingChange]);

  const move = (next: number | null) => {
    onPlayingChange(false);
    setCollapsedId(null);
    onStep(next);
  };

  return (
    <aside aria-label="History change walkthrough" className={styles.inspector}>
      <header className={styles.inspectorHeader}>
        <h2>
          Changes <span>{cards.length}</span>
        </h2>
        <span>
          {selectedIndex >= 0 ? `${selectedIndex + 1} / ${cards.length}` : `${cards.length} total`}
        </span>
      </header>
      {onViewNodeHistory && (
        <button
          type="button"
          className="mx-3 my-2 rounded-[5px] border border-[var(--stroke-divider)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover-bg)]"
          onClick={onViewNodeHistory}
        >
          View node history
        </button>
      )}
      <div
        className={styles.cardList}
        ref={list}
        onWheel={() => onPlayingChange(false)}
        onTouchStart={() => onPlayingChange(false)}
      >
        {cards.length === 0 ? (
          <p className={styles.empty}>No state changes in this commit.</p>
        ) : (
          cards.map((card, index) => {
            const open = selectedId === card.id && collapsedId !== card.id;
            const change = card.change;
            const bodyId = `history-change-${index}`;
            return (
              <article
                key={card.id}
                className={cn(styles.card, open && styles.openCard)}
                data-active={open ? 'true' : undefined}
              >
                <button
                  type="button"
                  className={styles.cardHeading}
                  aria-label={`Inspect change ${index + 1}: ${card.path} (${change.kind})`}
                  aria-expanded={open}
                  aria-controls={bodyId}
                  onClick={() => {
                    onPlayingChange(false);
                    setCollapsedId(open ? card.id : null);
                    onSelect(card.id);
                  }}
                >
                  <span className={styles.sequence}>{String(index + 1).padStart(2, '0')}</span>
                  <span className={styles.headingCopy}>
                    <span className={styles.name}>{card.name}</span>
                    <span className={styles.meta}>
                      {change.kind}
                      {step !== null ? ` · ${index < count ? 'Applied' : 'Upcoming'}` : ''}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(styles.chevron, open && styles.chevronOpen)}
                    size={14}
                  />
                </button>
                <div className={styles.fold} data-open={open} inert={!open} id={bodyId}>
                  <div className={styles.foldInner}>
                    <div className={styles.cardBody}>
                      <p className={styles.path} title={card.path}>
                        {card.path}
                      </p>
                      <div className={styles.values}>
                        {change.kind !== 'added' && (
                          <div>
                            <span className="sr-only">Before</span>
                            <pre className={styles.before}>{change.beforeValue}</pre>
                          </div>
                        )}
                        {change.kind === 'modified' && (
                          <span className={styles.valueArrow} aria-hidden="true">
                            →
                          </span>
                        )}
                        {change.kind !== 'removed' && (
                          <div>
                            <span className="sr-only">Result</span>
                            <pre className={styles.after}>{change.afterValue}</pre>
                          </div>
                        )}
                      </div>
                      <section className={styles.detailSection}>
                        <h3>Why</h3>
                        <p>{changeReason || change.reason || change.summary}</p>
                      </section>
                      <section className={styles.detailSection}>
                        <h3>Source</h3>
                        <p className={styles.source}>
                          {card.sourceHref ? (
                            <Link href={card.sourceHref}>{card.sourceLabel}</Link>
                          ) : (
                            card.sourceLabel || 'No source material linked'
                          )}
                        </p>
                        {change.evidence && <p>{change.evidence}</p>}
                      </section>
                      <section className={styles.detailSection}>
                        <h3>Checks</h3>
                        <p className={styles.unavailable}>
                          Verification results not loaded for this revision.
                        </p>
                      </section>
                      <button
                        type="button"
                        className={styles.replayOne}
                        onClick={() => {
                          move(index);
                          onSelect(card.id);
                          onPlayingChange(true);
                        }}
                      >
                        Replay from this change
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
      <section className={styles.controls} aria-label="Change walkthrough controls">
        <div className={styles.transport}>
          <button
            type="button"
            className={styles.primary}
            disabled={!cards.length}
            onClick={() => {
              onStep(0);
              setCollapsedId(null);
              onPlayingChange(true);
            }}
          >
            <RotateCcw size={14} />
            Replay again
          </button>
          <button
            type="button"
            aria-label={playing ? 'Pause walkthrough' : 'Resume walkthrough'}
            disabled={!cards.length}
            onClick={() => {
              if (!playing && count >= cards.length) onStep(0);
              onPlayingChange(!playing);
            }}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            type="button"
            aria-label="Previous change"
            disabled={count === 0 || !cards.length}
            onClick={() => move(count - 1)}
          >
            <SkipBack size={14} />
          </button>
          <button
            type="button"
            aria-label="Next change"
            disabled={count >= cards.length}
            onClick={() => move(count + 1)}
          >
            <SkipForward size={14} />
          </button>
        </div>
        <div className={styles.progress}>
          <input
            type="range"
            min={0}
            max={cards.length}
            value={count}
            aria-label="Walkthrough progress"
            aria-valuetext={`${count} of ${cards.length} changes shown`}
            disabled={!cards.length}
            onChange={(event) => move(Number(event.target.value))}
          />
          <output aria-live="polite">
            {count} / {cards.length}
          </output>
        </div>
        <div className={styles.pace}>
          <label>
            Pace{' '}
            <select value={pace} onChange={(event) => setPace(Number(event.target.value))}>
              <option value={1000}>1 sec</option>
              <option value={1800}>1.8 sec</option>
              <option value={3000}>3 sec</option>
            </select>
          </label>
          <button type="button" onClick={() => move(null)}>
            Show full diff
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {playing
            ? 'Playing'
            : step === null
              ? 'Full comparison'
              : count === cards.length
                ? 'Complete'
                : 'Paused'}{' '}
          · Visual walkthrough of the diff, not recorded intermediate commits.
        </p>
      </section>
    </aside>
  );
}
