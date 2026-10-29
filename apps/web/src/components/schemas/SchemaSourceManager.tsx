'use client';

import type { StudioCandidate } from '@t3x-dev/api-client';
import { ArrowUpRight, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReferenceIcon as Icon } from './DiscoverReference';
import s from './SchemaStudioExperience.module.css';

type SourceOption = {
  id: string;
  title: string;
  source: string;
  candidate?: StudioCandidate;
};

export function SchemaSourceManager({
  open,
  onOpenChange,
  browseHref,
  modules,
  onRemove,
  removalBlockers,
  pending,
  loading,
  error,
  onAdd,
  combineDisabledReason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  browseHref: string;
  modules: SourceOption[];
  onRemove: (id: string) => void;
  removalBlockers: Record<string, string>;
  pending: boolean;
  loading: boolean;
  error?: string;
  onAdd?: () => void;
  combineDisabledReason?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const visibleModules = modules.filter((module) =>
    `${module.title} ${module.source}`.toLowerCase().includes(query.toLowerCase())
  );
  const combineReason =
    combineDisabledReason ||
    (!onAdd
      ? 'Combining sources is unavailable.'
      : pending
        ? 'Wait for the current operation to finish before combining sources.'
        : loading
          ? 'Wait for sources to finish loading before combining them.'
          : undefined);
  function moduleIcon(module: SourceOption) {
    return (
      <span className={s.mi}>
        <Icon name={module.candidate?.kind === 'schema' ? 'braces' : 'box'} size={15} />
      </span>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Manage sources" title="Manage sources">
          <Settings2 size={14} aria-hidden="true" /> Manage sources…
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[65vh] w-[min(560px,calc(100vw-32px))] overflow-y-auto"
        aria-label="Manage Schema sources"
      >
        <p className="mb-3 text-sm font-medium">Schema sources · {modules.length}</p>
        <p className={s.feedback}>
          Reusable definitions for adding nodes and object fields to your schema.
        </p>
        <div className={s.sourceToolbar}>
          <input
            aria-label="Filter sources"
            placeholder="Search sources…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onAdd?.();
            }}
            disabled={Boolean(combineReason)}
            aria-describedby={combineReason ? `${id}-combine-reason` : undefined}
          >
            Combine schemas…
          </Button>
          <Link href={browseHref} className={s.navLink}>
            Browse schema catalog <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
        {combineReason ? (
          <p id={`${id}-combine-reason`} className={s.feedback}>
            {combineReason}
          </p>
        ) : null}
        {loading ? <output className={s.feedback}>Loading sources…</output> : null}
        {error ? (
          <p role="alert" className={s.feedback}>
            {error}
          </p>
        ) : null}
        <ul className={s.sourceList}>
          {visibleModules.map((module, index) => {
            const removalReason = removalBlockers[module.id];
            const removalReasonId = `${id}-remove-reason-${index}`;
            return (
              <li key={module.id} className={s.sourceRow}>
                <div className={s.sourceIdentity} style={{ cursor: 'default' }}>
                  {moduleIcon(module)}
                  <span>
                    <b>{module.title}</b>
                    <small>
                      {module.candidate?.source?.canonicalName ?? module.source} ·{' '}
                      {module.candidate?.source?.version ?? 'Unavailable'}
                    </small>
                  </span>
                </div>
                <div className={s.sourceMetadata}>
                  <details>
                    <summary>Source hash</summary>
                    <code>{module.candidate?.source?.hash ?? 'Hash unavailable'}</code>
                  </details>
                  {removalReason ? <span id={removalReasonId}>{removalReason}</span> : null}
                </div>
                {module.candidate ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${module.title}`}
                    disabled={pending || Boolean(removalReason)}
                    aria-describedby={removalReason ? removalReasonId : undefined}
                    onClick={() => onRemove(module.id)}
                  >
                    Remove from sources
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!loading && !error && !modules.length ? (
          <p className={s.feedback}>
            No sources yet. Browse schemas to add a definition or module.
          </p>
        ) : modules.length && !visibleModules.length ? (
          <p className={s.feedback}>No sources match this search.</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
